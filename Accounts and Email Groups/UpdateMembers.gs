function parseFile(fileName) {
  let folder = DriveApp.getFolderById(CAPWATCH_FOLDER_ID),
      files = folder.getFilesByName(fileName + '.txt');
  if (files.hasNext()) {
    let fileContent = files.next().getBlob().getDataAsString();
    return Utilities.parseCsv(fileContent).slice(1);
  } else {
    console.log('File ' + fileName + '.txt not found.');
    return [];
  }
}

function getSquadrons() {
  let squadrons = {};
  let squadronData = parseFile('Organization');
  for (var i=0; i < squadronData.length; i++) {
    if (squadronData[i][2] === WING) {
      squadrons[squadronData[i][0]] = {
        orgid: squadronData[i][0],
        name: squadronData[i][5],
        charter: Utilities.formatString("%s-%s-%03d", squadronData[i][1], squadronData[i][2], squadronData[i][3]),
        unit: squadronData[i][3],
        nextLevel: squadronData[i][4],
        scope: squadronData[i][9],
        wing: squadronData[i][2],
        orgPath: ''
      }
    }
  }

  // Artificial AEM Unit using MIWG
  squadrons[182] =  {
      ...squadrons[223],
      orgid: '182',
      name: "Aerospace Education Members"
    };

  let orgPaths = parseFile('OrgPaths');
  for (var i=0; i < orgPaths.length; i++) {
    if (squadrons[orgPaths[i][0]]) {
      squadrons[orgPaths[i][0]].orgPath = orgPaths[i][1];
    }
  }

  return squadrons;
}

/**
 * Get Members
 * @param String[] types - array of member types to include, optional (Default: ['CADET','SENIOR','FIFTY YEAR','LIFE', 'AEM'])
 */
function getMembers(types = ['CADET','SENIOR','FIFTY YEAR','LIFE', 'AEM']) {
  let start = new Date();
  let members = {};
  let squadrons = getSquadrons();
  //Parse Members.txt
  let memberData = parseFile('Member');
  let length = 0;
  for (var i=0; i < memberData.length; i++) {
    if (memberData[i][24] === 'ACTIVE' && memberData[i][13] != 0 && memberData[i][13] != 999 && types.indexOf(memberData[i][21]) > -1) {
      length++;
      let orgid = memberData[i][11];
      let squadron = squadrons[memberData[i][11]];
      members[memberData[i][0]] = {
        capsn: memberData[i][0],
        lastName: memberData[i][2],
        firstName: memberData[i][3],
        orgid: memberData[i][11],
        group: (squadrons[memberData[i][11]].scope === 'UNIT'? squadrons[memberData[i][11]].nextLevel : (squadrons[memberData[i][11]].scope === 'GROUP'? memberData[i][11] : '')),
        charter: squadrons[memberData[i][11]].charter,
        rank: memberData[i][14],
        type: memberData[i][21],
        status: memberData[i][24],
        modified: memberData[i][19],
        orgPath: squadrons[memberData[i][11]].orgPath,
        email: null,
        dutyPositions: [],
        dutyPositionIds: [],
        dutyPositionIdsAndLevel: []
      }
    }
  }
  console.log('Number of members to process: ', length);
  //Parse MbrContact.txt
  let contactData = parseFile('MbrContact');
  for (var i=0; i < contactData.length; i++) {
    if (members[contactData[i][0]] && contactData[i][2] === 'PRIMARY') {
      if (contactData[i][1] === 'EMAIL') {
        members[contactData[i][0]].email = contactData[i][3].toLowerCase();
      }
    }
  }
  
  //Parse Duty Positions
  let dutyPositionData = parseFile('DutyPosition');
  for (var i=0; i < dutyPositionData.length; i++) {
    if (members[dutyPositionData[i][0]]) {
      let dutyPositionID = dutyPositionData[i][1].trim();
      members[dutyPositionData[i][0]].dutyPositions.push({
        value: Utilities.formatString("%s (%s) (%s)", dutyPositionID, (dutyPositionData[i][4] == '1'? 'A' : 'P'), squadrons[dutyPositionData[i][7]].charter),
        id: dutyPositionID,
        level: dutyPositionData[i][3],
        assistant: dutyPositionData[i][4] == '1'
      });
      members[dutyPositionData[i][0]].dutyPositionIds.push(dutyPositionID);
      members[dutyPositionData[i][0]].dutyPositionIdsAndLevel.push(dutyPositionID + '_' + dutyPositionData[i][3]);
    }
  }
  
  //Parse Cadet Duty Positions
  let cadetDutyPositionData = parseFile('CadetDutyPositions');
  for (var i=0; i < cadetDutyPositionData.length; i++) {
    if (members[cadetDutyPositionData[i][0]]) {
      members[cadetDutyPositionData[i][0]].dutyPositions.push({
        value: Utilities.formatString("%s (%s) (%s)", cadetDutyPositionData[i][1], (cadetDutyPositionData[i][4] == '1'? 'A' : 'P'), squadrons[cadetDutyPositionData[i][7]].charter)});
      members[cadetDutyPositionData[i][0]].dutyPositionIds.push(cadetDutyPositionData[i][1]);
    }
  }
  console.log('Get member data: ', new Date() - start + 'ms');
  return members;
}

/**
 * Get Aerospace Education Members
 */
function getAEMembers() {
  let start = new Date();
  let members = {};
  let squadrons = getSquadrons();
  //Parse Members.txt
  let memberData = parseFile('Member');
  let length = 0;
  for (var i=0; i < memberData.length; i++) {
    if (memberData[i][24] === 'ACTIVE' && memberData[i][13] != 0 && memberData[i][13] != 999 && ['AEM'].indexOf(memberData[i][21]) > -1) {
      length++;
      members[memberData[i][0]] = {
        capsn: memberData[i][0],
        lastName: memberData[i][2],
        firstName: memberData[i][3],
        orgid: memberData[i][11],
        group: (squadrons[memberData[i][11]].scope === 'UNIT'? squadrons[memberData[i][11]].nextLevel : (squadrons[memberData[i][11]].scope === 'GROUP'? memberData[i][11] : '')),
        charter: squadrons[memberData[i][11]].charter,
        rank: memberData[i][14],
        type: memberData[i][21],
        status: memberData[i][24],
        modified: memberData[i][19],
        orgPath: squadrons[memberData[i][11]].orgPath,
        email: null,
        dutyPositions: [],
        dutyPositionIds: [],
        dutyPositionIdsAndLevel: []
      }
    }
  }
  console.log('Number of members to process: ', length);
  //Parse MbrContact.txt
  let contactData = parseFile('MbrContact');
  for (var i=0; i < contactData.length; i++) {
    if (members[contactData[i][0]] && contactData[i][2] === 'PRIMARY') {
      if (contactData[i][1] === 'EMAIL') {
        members[contactData[i][0]].email = contactData[i][3].toLowerCase();
      }
    }
  }

  console.log('Get member data: ', new Date() - start + 'ms');
  return members;
}

function getCurrentMemberData() {
  let folder = DriveApp.getFolderById(CAPWATCH_FOLDER_ID),
      files = folder.getFilesByName('CurrentMembers.txt');
  if (files.hasNext()) {
    let content = files.next().getBlob().getDataAsString();
    if (content) {
      return JSON.parse(content);
    } else {
      return {};
    }
  }
}

function saveCurrentMemberData(currentMembers) {
  let folder = DriveApp.getFolderById(CAPWATCH_FOLDER_ID),
      files = folder.getFilesByName('CurrentMembers.txt');
  if (files.hasNext()) {
    let file = files.next(),
        content = JSON.stringify(currentMembers);
    file.setContent(content);
    console.log('Saved current members to CurrentMembers.txt');
  }
}

function memberUpdated(newMember, previousMember) {
  return (!newMember || !previousMember) || (newMember.rank !== previousMember.rank || 
     newMember.charter !== previousMember.charter || 
     newMember.dutyPositions.join('') !== previousMember.dutyPositions.join('') || 
     newMember.status !== previousMember.status ||
     newMember.email !== previousMember.email);
}

function addOrUpdateUser(member) {
  let primaryEmail = member.capsn + EMAIL_DOMAIN;
  let user;
  
  //Try Updating User
  let updates = {
    orgUnitPath: member.orgPath,
    recoveryEmail: member.email,
    customSchemas: {
      MemberData: {
        CAPID: member.capsn,
        Rank: member.rank,
        Organization: member.charter,
        DutyPosition: member.dutyPositions,
        Type: member.type,
        LastUpdated: Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd")
      }
    }
  };

  //Suspend members moved to MI-000 or MI-999
  if (member.orgid == 744 || member.orgid == 1920) {
    user.suspended = true;
  }

  try {
    user = AdminDirectory.Users.update(updates, primaryEmail);
    console.log('Updated user: ', primaryEmail);
  } catch (e) {
    console.log('Unable to update user ' + primaryEmail + ': ', e);
  }
  if (!user) {
    //User not found, add new user
    user = {
      primaryEmail: primaryEmail,
      name: {
        givenName: member.firstName,
        familyName: member.lastName
      },
      suspended: false,
      changePasswordAtNextLogin: true,
      password: Math.random().toString(36),
      orgUnitPath: member.orgPath,
      recoveryEmail: member.email,
      customSchemas: {
        MemberData: {
          CAPID: member.capsn,
          Rank: member.rank,
          Organization: member.charter,
          DutyPosition: member.dutyPositions,
          Type: member.type,
          LastUpdated: Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd")
        }
      }
    };
    try {
      //Save new user
      let newUser = AdminDirectory.Users.insert(user);
      console.log('Added new user: ' + primaryEmail);
      //Add Alias
      if (newUser) {
        let aliasEmail = member.firstName.replace(/\s/g, '') + '.' + member.lastName.replace(/\s/g, '') + EMAIL_DOMAIN;
        let alias = AdminDirectory.Users.Aliases.insert({alias: aliasEmail}, primaryEmail);
        console.log('Alias for user ' + primaryEmail + ' set to: ', aliasEmail);
      }
    } catch (e) {
      console.log('Error adding new user ' + primaryEmail + ': ' , e);
    }
  }
}

function getActiveMembers() {
  let activeMembers = {};
  let memberData = parseFile('Member');
  for (var i=0; i < memberData.length; i++) {
    if (memberData[i][24] === 'ACTIVE') {
      activeMembers[memberData[i][0]] = memberData[i][16];
    }
  }
  return activeMembers;
}

function suspendMember(email) {
  try {
    let member = AdminDirectory.Users.update({suspended: true}, email);
    console.log('Suspended member: ', email);
    return true;
  } catch (e) {
    console.log('Error suspending member: ', e);
    return false;
  }
}

function getActiveUsers() {
  let activeUsers = [];
  let nextPageToken = '';
  do {
    let page = AdminDirectory.Users.list({
      domain: DOMAIN,
      maxResults: 500,
      query: 'isSuspended=false isAdmin=false orgUnitPath=/MI-001',
      projection: 'custom',
      customFieldMask: 'MemberData',      
      pageToken: nextPageToken
    });
    nextPageToken = page.nextPageToken;
    if (page.users) {
      for (var i=0; i < page.users.length; i++) {
        if (page.users[i].customSchemas && page.users[i].customSchemas.MemberData && page.users[i].customSchemas.MemberData.CAPID) {
          activeUsers.push({
            email: page.users[i].primaryEmail, 
            capid: page.users[i].customSchemas.MemberData.CAPID,
            lastUpdated: page.users[i].customSchemas.MemberData.LastUpdated
          });
        }
      }
    }
  } while(nextPageToken)
  return activeUsers;
}


//Main Function
function updateAllMembers() {
  let start = new Date();
  let members = getMembers();
  let currentMembers = getCurrentMemberData();
  for (var member in members) {
    if (memberUpdated(members[member], currentMembers[member])) {
      addOrUpdateUser(members[member]);
    }
  }
  saveCurrentMemberData(members);  
  console.log('Updated all members: ', new Date() - start + 'ms');
}

function suspendExpiredMembers() {
  let activeMembers = getActiveMembers();
  let users = getActiveUsers();
  let suspended = 0;
  let suspensionTime = new Date().getTime() - (SUSPENSION_GRACE_DAYS * 86400000);
  for(var i=0; i < users.length; i++) {
    if (users[i].capid && !(users[i].capid in activeMembers)) {
      if (!users[i].lastUpdated || suspensionTime > new Date(users[i].lastUpdated).getTime()) {
        let success = suspendMember(users[i].email);
        if (success) {
          suspended++;
        }
      } else {
        console.log('Member expired, pending suspension:', users[i].email);
      }
    }
  }
  console.log('Finished suspending expired users:', suspended + ' suspended');
}

function addAlias(user) {
  let maxRetry = 5;
  let aliasEmail
  let alias;
  // Try setting default alias first
  try {
    aliasEmail = user.name.givenName.replace(/\s/g, '')  + '.' + user.name.familyName.replace(/\s/g, '')  + EMAIL_DOMAIN;
    alias = AdminDirectory.Users.Aliases.insert({alias: aliasEmail}, user.primaryEmail);
    if (alias) {
      return alias;
    }
  } catch(err) {
    console.error(err);
    if (err.details.code !== 409) {
      return null;
    }
  }
  // Make 5 attempts to add incrementing aliases
  for (let index = 1; index <= maxRetry; index++) {
    try {
      aliasEmail = user.name.givenName.replace(/\s/g, '')  + '.' + user.name.familyName.replace(/\s/g, '') + index + EMAIL_DOMAIN;
      alias = AdminDirectory.Users.Aliases.insert({alias: aliasEmail}, user.primaryEmail);
      if (alias) {
        return alias;
      }
    } catch (err) {
      console.error(err);
      if (err.details.code !== 409) {
        return null;
      }
    }
  }
}

//Update users with missing aliases
function updateMissingAliases() {
    let nextPageToken = '';
    let totalUpdated = 0;
    let totalFailed = 0;
  do {
    let page = AdminDirectory.Users.list({
      domain: DOMAIN,
      maxResults: 500,
      query: 'orgUnitPath=/MI-001 isSuspended=false isAdmin=false',
      fields: 'users(name/givenName,name/familyName,primaryEmail,aliases),nextPageToken',   
      pageToken: nextPageToken
    });
    nextPageToken = page.nextPageToken;
    if (page.users) {
      for (var i=0; i < page.users.length; i++) {
        if (!page.users[i].aliases || page.users[i].aliases.length === 0) {
          // Add alias for user with missing alias
          let aliasEmail = page.users[i].name.givenName.replace(/\s/g, '')  + '.' + page.users[i].name.familyName.replace(/\s/g, '')  + EMAIL_DOMAIN;
          let alias = addAlias(page.users[i]);
          if (alias) {
            console.log('Alias for user ' + page.users[i].primaryEmail + ' set to: ', alias.alias);
            totalUpdated++;
          } else {
            console.error('Failed to add alias ' + aliasEmail + ' for user ' + page.users[i].primaryEmail + '.');
            totalFailed++;
          }
        }
      }
    }
  } while(nextPageToken)
  console.log('Alises added for ' + totalUpdated + ' users.');
  console.log('Failed to add aliases for ' + totalFailed + ' users.')
}


//Test Functions
function testaddOrUpdateUser() {
  let members = getMembers();
  addOrUpdateUser(members[443777]);
}

function testGetMember() {
  let members = getMembers();
  let member = members[105576];
  console.log(JSON.stringify(member));
}

function testGetSquadrons() {
  let squadrons = getSquadrons();
  console.log(squadrons[2503]);
}

function testSaveCurrentMembersData() {
  saveCurrentMemberData({});
}
