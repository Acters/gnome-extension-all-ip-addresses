'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Start with tun0 interface as default as a preference
var selected_interface = ['tun0','IPv4Address'];
var listofinterfaces = [];
var dictofinterfaces = {};

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
            }
        });
    });
}

async function _update_interface_list(Panel_Object) {
  var command_output = ' None';
  listofinterfaces = [];
  dictofinterfaces = {};
  try {
       command_output = await executeShellCommand(['ip', '-brief', 'addr']);
       command_output.split("\n").forEach(
        // Output of the "ip" command will be a string
        // "eth0             UP             192.168.100.100/24 ACAB::100:FFFF:feef:1234/64"
        line => {
          // Regex to grab the first 16 characters in the line; max interface name limit
          var Re = new RegExp(/^.{16}/g);
          var Interface_name = line.match(Re)[0].replaceAll(" ","");
          if (Interface_name != 'lo') {
            // Regex to grab the IPv4 Address
            var Re = new RegExp(/([0-9]{1,3}([.][0-9]{1,3}){3})/g);
            var matches = line.match(Re);
            var IPv4Address;
            if (matches) {
                IPv4Address = matches[0].replaceAll(" ","");
            }
            // Regex to grab the IPv6 Address
            var Re = new RegExp(/([A-Za-z0-9]{0,4}(:[A-Za-z0-9]{0,4}){2,8})/g);
            var matches = line.match(Re);
            var IPv6Address;
            if (matches) {
                IPv6Address = matches[0].replaceAll(" ","");
            }
            if (IPv4Address) {
              if (!listofinterfaces.includes(Interface_name)) listofinterfaces.push(Interface_name);
              (Interface_name in dictofinterfaces) ? (dictofinterfaces[Interface_name]['IPv4Address'] = IPv4Address) : (dictofinterfaces[Interface_name] = { "IPv4Address":IPv4Address });
            }
            if (IPv6Address) {
              if (!listofinterfaces.includes(Interface_name)) listofinterfaces.push(Interface_name);
              (Interface_name in dictofinterfaces) ? (dictofinterfaces[Interface_name]['IPv6Address'] = IPv6Address) : (dictofinterfaces[Interface_name] = { "IPv6Address":IPv6Address });
            }
          }
        }
      );
  } catch (e) {
      // Error
      log("Failed to retrieve Interfaces and IP addresses");
      logError(e);
  }
  
  command_output = 'None';
  var wanIpv4Address;
  try {
      command_output = await executeShellCommand(['curl', '--max-time','5', '-4', 'icanhazip.com']);
      var command_output_string = command_output.replace('"','').replace('"','').replace('\n','');
      // Validate the result is an ipv4 address
      var Re = new RegExp(/([0-9]{1,3}([.][0-9]{1,3}){3})/g);
      var matches = command_output_string.match(Re);
      if (matches) {
        wanIpv4Address = matches[0];
      }
      // Success
      //log("Success");
  } catch (e) {
      // Error
      logError(e);
  }
  if (wanIpv4Address) {
    if (!(listofinterfaces.includes('WAN'))) listofinterfaces.push('WAN');
    ('WAN' in dictofinterfaces) ? (dictofinterfaces['WAN']['IPv4Address'] = wanIpv4Address) : (dictofinterfaces['WAN'] = { "IPv4Address":wanIpv4Address });
  }
  
  command_output = 'None';
  var wanIpv6Address;
  try {
      command_output = await executeShellCommand(['curl', '--max-time','5', '-6', 'icanhazip.com']);
      var command_output_string = command_output.replace('"','').replace('"','').replace('\n','');
      // Validate the result is an ipv6 address
      var Re = new RegExp(/([A-Za-z0-9]{0,4}(:[A-Za-z0-9]{0,4}){2,8})/g);
      var matches = command_output_string.match(Re);
      if (matches) {
        wanIpv6Address = matches[0];
      }
  } catch (e) {
      // Error
      logError(e);
  }
  if (wanIpv6Address) {
    if (!(listofinterfaces.includes('WAN'))) listofinterfaces.push('WAN');
    ('WAN' in dictofinterfaces) ? (dictofinterfaces['WAN']['IPv6Address'] = wanIpv6Address) : (dictofinterfaces['WAN'] = { "IPv6Address":wanIpv6Address });
  }
  
  if (Object.keys(dictofinterfaces).length == 0) {
    selected_interface = ['lo','IPv4Address'];
    listofinterfaces = ['lo'];
    dictofinterfaces['lo'] = { "IPv4Address": "127.0.0.1", "IPv6Address": "::1" }; // safely assume link-local exists and populate dictofinterfaces with something
  }
  
  // Update Interface with new data and reset to first interface when an interface disappears
  selected_interface[0] = listofinterfaces.includes(selected_interface[0]) ? selected_interface[0] : listofinterfaces[0];
  Panel_Object.buttonText.set_text( selected_interface[0]+ '_' + selected_interface[1].replaceAll("Address","") + ": " + dictofinterfaces[selected_interface[0]][selected_interface[1]] );
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
        _update_interface_list(this).catch((e) => {
            logError(e);
            this.buttonText.set_text("Loading Error...");
          });
        this._updateLabel();

        this._notificationSource = this.getNotificationSource()
        this._activeNotification = null;
    }

    _toggleView(event){
      if (event.get_button() !== 1) {
        return Clutter.EVENT_PROPAGATE;
      }
      selected_interface[0] = selected_interface[1].includes('IPv4Address') ? (('IPv6Address' in dictofinterfaces[selected_interface[0]]) ? selected_interface[0]:listofinterfaces[(listofinterfaces.indexOf(selected_interface[0])+1==listofinterfaces.length) ? 0 : listofinterfaces.indexOf(selected_interface[0])+1]) : listofinterfaces[(listofinterfaces.indexOf(selected_interface[0])+1==listofinterfaces.length) ? 0 : listofinterfaces.indexOf(selected_interface[0])+1];
      selected_interface[1] = ('IPv4Address' in dictofinterfaces[selected_interface[0]]) ? (selected_interface[1].includes('IPv4Address') ? (('IPv6Address' in dictofinterfaces[selected_interface[0]]) ? (this.buttonText.get_text().includes(dictofinterfaces[selected_interface[0]][selected_interface[1]]) ? 'IPv6Address':'IPv4Address'):'IPv4Address') : 'IPv4Address') : 'IPv6Address';
      this.buttonText.set_text( selected_interface[0]+ '_' + selected_interface[1].replaceAll("Address","") + ": " + dictofinterfaces[selected_interface[0]][selected_interface[1]] );
      
      return Clutter.EVENT_STOP;
    }
    
    _copyToClipboard(event) {
        // Check if it's a right-click (button 3)
        if (event.get_button() !== 3) {
            return Clutter.EVENT_PROPAGATE;
        }

        const clipboard = St.Clipboard.get_default();
        const ipAddress = dictofinterfaces[selected_interface[0]][selected_interface[1]];
        clipboard.set_text(St.ClipboardType.CLIPBOARD, ipAddress);

        this._showNotification(ipAddress);
        
        return Clutter.EVENT_STOP;
    }

    _updateLabel(){
        const refreshTime = 5 // in seconds

        if (this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
        }
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, refreshTime, () => {this._updateLabel();});
        // update asynchronously every 5 seconds
        _update_interface_list(this).catch((e) => {
            logError(e);
            this.buttonText.set_text("Loading Error...");
          });
    }
    
    getNotificationSource() {
      let notificationSource = this._notificationSource
      if (!notificationSource) {
        notificationSource = new MessageTray.Source({
            title: _('IP Address Copied'),
            icon: new Gio.ThemedIcon({name: 'dialog-information-symbolic'}),
            iconName: 'dialog-information-symbolic',
        });

        // Reset the notification source if it's destroyed
        notificationSource.connect('destroy', _source => {
            this._notificationSource = null;
            this._activeNotification = null;
        });
        Main.messageTray.add(notificationSource);
      }

      return notificationSource;
    }

    _showNotification(ipAddress) {
        const title = 'IP Address Copied';
        const body = `Copied ${ipAddress} to clipboard`;

        if (this._activeNotification) {
            // Update existing notification
            this._activeNotification.body = body;
            // Reset notification
            this.getNotificationSource().addNotification(this._activeNotification);
            // Force subsequent addNotification calls to reset the Notification. 
            // This strategy of reusing the notification and keeping it from hiding can cause a race condition that when it is hiding the notification, it can silently fail to prevent it from hiding. 
            // This is a small issue, and not a concern because the user may not notice. This is an notification, and only to alert user of copying IP address to clipboard.
            this._activeNotification.acknowledged = false;
        } else {
            // Create new notification
            this._activeNotification = new MessageTray.Notification({
                source: this.getNotificationSource(),
                title: title,
                body: body,
                urgency: MessageTray.Urgency.NORMAL,
            });
            this._activeNotification.isTransient = true;
            this.getNotificationSource().addNotification(this._activeNotification);
        }
    }

    stop() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
        }
        this._timeout = undefined;

        this.menu.removeAll();
        
        if (this._activeNotification) {
            this._activeNotification.destroy();
            this._activeNotification = null;
        }
    }
}

export default class AllIPAddressExtension extends Extension {

    enable() {
        this._indicator = new AllIPAddressIndicator();
        Main.panel.addToStatusArea('all-ip-addresses-indicator', this._indicator);
        this._indicator.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
              // on left-click toggle between IPs
                return this._indicator._toggleView(event);
            } else if (event.get_button() === 3) {
              // on right-click copy current IP to clipboard
                return this._indicator._copyToClipboard(event);
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    disable() {
        this._indicator.stop();
        this._indicator.destroy();
        this._indicator = null;
    }
}
