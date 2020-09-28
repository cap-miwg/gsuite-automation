# SSMTP
## Install
Following directions from  this article https://linuxhandbook.com/linux-send-email-ssmtp/
### Install SSMTP
	sudo apt install ssmtp
### Configure SSMTP
	sudo nano /etc/ssmtp/ssmtp.conf
Append the file or replace entire with the following:
	root=MyEmailAddress@gmail.com
	mailhub=smtp.gmail.com:587
	AuthUser=MyEmailAddress@gmail.com
	AuthPass=MyPassword
	UseTLS=YES
	UseSTARTTLS=YES
	rewriteDomain=gmail.com
	hostname=MyEmailAddress@gmail.com
	FromLineOverride=YES


