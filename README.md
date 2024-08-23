# gnome-extension-all-ip-addresses

This is the code behind the GNOME Shell Extension called **ALL IP Addresses** ~~, available in the GNOME Shell Extension store at https://extensions.gnome.org/extension/3994/all-ip-addresses/~~

## Introduction

This extention is based upon the **ALL IP Addresses** extention. I added the dynamic switch between Device interface IPs, and WAN public IPs for both IPv4 and IPv6.
This extention will only show the IP-addresses your workstation to per interface, and what is the public IP address that others can reach you from.

## How it works
Uses `iproute2`'s `ip address -brief` command to get list of interfaces and their IP address.
Uses `curl --max-time 5 -4 icanhazip.com` and `curl --max-time 5 -6 icanhazip.com` to find WAN public IP.
Left-click will cycle through IP address and their associated interface.
Right-click will copy to clipboard the currently displayed IP address.

## Known limitations
In an environment where `icanhazip.com` is unreachable but internet connection is fine then WAN IP will not show. This is a minor limitation.
Requires `iproute2` package on linux to be installed, or any equivalent `ip` command.
Will only update every 5 seconds. 
It is possible there can be race condition, so be patient and retry.

## Credits
This code is based upon a fork of [**ALL IP Addresses** extention by Peter Havekes](https://github.com/phavekes/gnome-extension-all-ip-addresses)
