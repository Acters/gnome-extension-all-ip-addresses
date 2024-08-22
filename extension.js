'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Start with tun0 address as default
var type=1;

function executeShellCommand(argv) {
    let flags = (Gio.SubprocessFlags.STDOUT_PIPE |
                 Gio.SubprocessFlags.STDERR_PIPE);

    let proc = Gio.Subprocess.new(argv, flags);

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                let status = proc.get_exit_status();

                if (status !== 0) {
                    throw new Gio.IOErrorEnum({
                        code: Gio.io_error_from_errno(status),
                        message: stderr ? stderr.trim() : GLib.strerror(status)
                    });
                }

                resolve(stdout.trim());
            } catch (e) {
                reject(e);
                return " None";
            }
        });
    });
}

async function _get_VPN_address(Panel_Object) {
    var vpn0_result = ' None';
    var tun0_result = ' None';
    // pull the ip address for tun0 and vpn0
    log("getting vpn0");
    try {
         vpn0_result = await executeShellCommand(['ip', '-brief', '-4', 'addr', 'show', 'dev', 'vpn0']);
         
         // Success
         log("vpn0 Success");
    } catch (e) {
        // Error
        logError(e);
        vpn0_result = ' None';
    }
    log("getting tun0");
    try {
         tun0_result = await executeShellCommand(['ip', '-brief', '-4', 'addr', 'show', 'dev', 'tun0']);
         
         // Success
         log("tun0 Success");
    } catch (e) {
        // Error
        logError(e);
        tun0_result = ' None';
    }

    var Re = new RegExp(/ ([0-9]+([.][0-9]+)+)/g);
    var matches = vpn0_result.match(Re);
    var vpn0IpAddress;
    if (matches) {
        vpn0IpAddress = matches[0].split(' ')[1];
    } else {
        vpn0IpAddress = ' None';
    }
    matches = tun0_result.match(Re);
    var tun0IpAddress;
    if (matches) {
        tun0IpAddress = matches[0].split(' ')[1];
    } else {
        tun0IpAddress = ' None';
    }
    var VPNIpAddress = ' None';
    // checks both interfaces if they are set then it will append both, else it will choose one; if both are none then it is None.
    VPNIpAddress = vpn0IpAddress.includes("None") ? (tun0IpAddress.includes("None") ? " None" : tun0IpAddress) : (tun0IpAddress.includes("None") ? vpn0IpAddress : (vpn0IpAddress + ", "+tun0IpAddress))
    Panel_Object.buttonText.set_text("VPN: " + VPNIpAddress);
}

async function _get_lan_ip4(Panel_Object) {
    // Ask the IP stack what route would be used to reach 1.1.1.1 (Cloudflare DNS)
    // Specifically, what src would be used for the 1st hop?
    var command_output = ' None';
    try {
         command_output = await executeShellCommand(['ip', '-brief', '-4', 'addr', 'show', 'dev', 'eth0']);
         
         // Success
         log("Lan Success");
    } catch (e) {
        // Error
        logError(e);
        command_output = ' None';
    }

    // Output of the "ip route" command will be a string
    // "eth0             UP             192.168.100.100/24"
    var Re = new RegExp(/ ([0-9]+([.][0-9]+)+)/g);
    var matches = command_output.match(Re);
    var lanIpAddress;
    if (matches) {
        lanIpAddress = matches[0];
    } else {
        lanIpAddress = ' None';
    }

    Panel_Object.buttonText.set_text("LAN: " + lanIpAddress);
}

async function _get_lan_ip6(Panel_Object) {
    var command_output = ' None';
    try {
         command_output = await executeShellCommand(['ip', '-brief', '-6', 'addr', 'show', 'dev', 'eth0']);
         
         // Success
         log("Success");
    } catch (e) {
        // Error
        logError(e);
        command_output = ' None';
    }

    // Output of the "ip" command will be a string
    // "eth0             UP             fa4e::add:7e55:1976:1/64"
    var Re = new RegExp(/ ([:A-Za-z0-9]+(:[A-Za-z0-9]+)+)/g);
    var matches = command_output.match(Re);
    var lanIpv6Address;
    if (matches) {
        lanIpv6Address = matches[0];
    } else {
        lanIpv6Address = ' None';
    }
    Panel_Object.buttonText.set_text("IPv6: "+ lanIpv6Address)
}

async function _get_wan_ip4(Panel_Object) {
    // Use the google dns servers to find the publip ip address used for requests
    // Force a ipv4 conection, because ipv6 won't be NAT'ed
    var command_output = ' None';
    try {
         command_output = await executeShellCommand(['dig', 'TXT', '+short', 'o-o.myaddr.l.google.com', '@ns1.google.com', '-4']);
         
         // Success
         log("Success");
    } catch (e) {
        // Error
        logError(e);
        command_output = ' None';
    }
    var command_output_string = command_output.replace('"','').replace('"','').replace('\n','');
    // Validate the result looks like an ipv4 address
    var Re = new RegExp(/.*\..*\..*\..*/g);
    var matches = command_output_string.match(Re);
    var wanIpAddress;
    if (matches) {
        wanIpAddress = command_output_string;
    } else {
        wanIpAddress = ' None';
    }
    Panel_Object.buttonText.set_text("WAN: " + wanIpAddress);
}

class AllIPAddressIndicator extends PanelMenu.Button{
  
    static {
        GObject.registerClass(this);
    }

    _init() {
        // Chaining up to the super-class
        super._init(0.0, "All IP Addresses Indicator", false);

        this.buttonText = new St.Label({
            text: 'Loading...',
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(this.buttonText);
        this._updateLabel();
    }

    _toggleView(){
      console.log("Updating label for all-ip extension")
      if (type===4) {
        type=6;
      } else if (type===6) {
        type=0;
      } else if (type===0){
        type=1;
      } else if (type===1){
        type=4
      }
      this._updateLabel();
    }

    _updateLabel(){
        const refreshTime = 20 // in seconds

        if (this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
        }
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, refreshTime, () => {this._updateLabel();});
        // Show the right format. 0 = WAN, 4 = IPv4, 6=IPv6
        // Do it asynchronously
        if (type===4) {
          _get_lan_ip4(this).catch((e) => {
            logError(e);
            this.buttonText.set_text("LAN: Error...");
          });
        } else if (type===0) {
          _get_wan_ip4(this).catch((e) => {
            logError(e);
            this.buttonText.set_text("WAN: Error...");
          });
        } else if (type===6){
          _get_lan_ip6(this).catch((e) => {
            logError(e);
            this.buttonText.set_text("IPv6: Error...");
          });
        } else {
          _get_VPN_address(this).catch((e) => {
            logError(e);
            this.buttonText.set_text("VPN: Error...");
          });
        }
    }

    _removeTimeout() {
        if (this._timeout) {
            this._timeout = null;
        }
    }

    stop() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
        }
        this._timeout = undefined;

        this.menu.removeAll();
    }
}

export default class AllIPAddressExtension extends Extension {

    enable() {
        this._indicator = new AllIPAddressIndicator();
        Main.panel.addToStatusArea('all-ip-addresses-indicator', this._indicator);
        this._indicator.connect('button-press-event', () => this._indicator._toggleView());
    }

    disable() {
        this._indicator.stop();
        this._indicator.destroy();
        this._indicator = null;
    }
}
