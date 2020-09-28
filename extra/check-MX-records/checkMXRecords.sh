#!/bin/bash

# DESCRIPTION
# Simple bash script that checks the mx records of domain and alerts on
# change. Useful when ran as a cron job when you are waiting for records
# to be changed by your hosting provider or if you're super paranoid about
# someone changing your records.
#
# PREREQUISITES
# Run the following command from the command line to generate the current
# records to be checked against.
# nslookup -q=MX <YOURDOMAIN> | grep <YOURDOMAIN> | cut -d" " -f 5 > currentRecords.txt
# example:
# nslookup -q=MX cap.gov | grep cap.gov | cut -d" " -f 5 > currentRecords.txt
#
# CONFIGURATION
# Change the <YOURDOMAIN> to the domain you will be running checks against.
# Change <RECIPIENTEMAIL> to the email address you want sent to.
#  See ssmtp-setup for more info.

# Pull the new records and store in txt file
nslookup -q=MX <YOURDOMAIN> | grep <YOURDOMAIN> | cut -d" " -f 5 > lookup.txt

# Compare current records to ones being looked up
if cmp -s currentRecords.txt lookup.txt; then exit
else
	echo -e "Subject: MX Record Check\nNew Records Found!" > email.txt
	cat lookup.txt >> email.txt
	/usr/sbin/ssmtp <RECIPIENTEMAIL> < email.txt	# Sends Email
fi
