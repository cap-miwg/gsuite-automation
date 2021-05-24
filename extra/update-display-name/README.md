# Updating Email Display Names
We utilize GAM to update our users display names each day at 0100. This is ran under cron job in a B1 Linux instance in Azure.

Google Apps Manager, GAM, is a command line utility developed by [Jay0lee](https://github.com/jay0lee/GAM) to easily manage Google Workspace from a terminal. We utilize three commmands chained together to perform these display name updates. The exact cron job is listed in the cron.txt file for reference. We'll walk through each portion of the job.

## Pulling User Information

	gam print users primaryEmail aliases lastname firstname custom all query orgUnitPath=/MI-001 > users.csv;

Our account and email group automation scripts pull the data from CAPWATCH to manage our accounts in Google. We add custom fields to each user to list their duty positions, rank, unit, etc. in order to track that information. This first portion of the cron job pulls that information and stores it into a csv file on the Linux instance. Since the two following commands need to use that same information, it's easiest to just store in a file for the following commands to reference.

## Creating Default SendAs Addresses
	
	gam csv users.csv gam user ~primaryEmail sendas ~aliases.0 "~~name.familyName~~, ~~name.givenName~~ ~~customSchemas.MemberData.Rank~~ CAP ~~customSchemas.MemberData.Organization~~" default treatasalias True 2>&1 | tee $(date +%Y-%m-%d)_gam-job.log

This command pulls in the data from the csv we just created and runs the gam command to create sendas addresses for each member. While we create aliases for each member in our automation scripts, it doesn't default to adding that alias as a sendas address in Gmail. This command ensures each member has a sendas address before updating it. If they didn't have one previously created, the update part wouldn't work for that member.

To better explain, the gam user command is ran across each member in the users.csv file. The ~primaryEmail field is replaced by each member's CAPID email. Then we create a sendas with their ~alias email (first.last) and set their name to be "Last, First, Rank, CAP, GLR-MI-XXX". Finally we set this sendas address as the default and treat it as an alias (default behavior in Google). The rest is to pipe the results to a log file sorted by date.

## Updating Default SendAs Addresses

	gam csv users.csv gam user ~primaryEmail update sendas ~aliases.0 name "~~name.familyName~~, ~~name.givenName~~ ~~customSchemas.MemberData.Rank~~ CAP ~~customSchemas.MemberData.Organization~~" default treatasalias True 2>&1 | tee $(date +%Y-%m-%d)_gam-job.log

This command is laid out almost identical to the one above but it's in the syntax of the update command rather than the create command.


