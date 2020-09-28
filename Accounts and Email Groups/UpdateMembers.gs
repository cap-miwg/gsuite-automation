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
  let orgPaths = parseFile('OrgPaths');
  for (var i=0; i < orgPaths.length; i++) {
    if (squadrons[orgPaths[i][0]]) {
      squadrons[orgPaths[i][0]].orgPath = orgPaths[i][1];
    }
  }
  return squadrons;
}

function getMembers() {
  let start = new Date();
  let members = {};
  let squadrons = getSquadrons();
  //Parse Members.txt
  let memberData = parseFile('Member');
  let length = 0;
  for (var i=0; i < memberData.length; i++) {
    if (memberData[i][13] != 0 && memberData[i][13] != 999 && (memberData[i][21] === 'SENIOR' || memberData[i][21] === 'CADET')) {
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
        dutyPositionIds: []
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
      members[dutyPositionData[i][0]].dutyPositions.push({value: Utilities.formatString("%s (%s) (%s)", dutyPositionData[i][1], (dutyPositionData[i][4] == '1'? 'A' : 'P'), squadrons[dutyPositionData[i][7]].charter)});
      members[dutyPositionData[i][0]].dutyPositionIds.push(dutyPositionData[i][1]);
    }
  }
  
  //Parse Cadet Duty Positions
  let cadetDutyPositionData = parseFile('CadetDutyPositions');
  for (var i=0; i < cadetDutyPositionData.length; i++) {
    if (members[cadetDutyPositionData[i][0]]) {
      members[cadetDutyPositionData[i][0]].dutyPositions.push({value: Utilities.formatString("%s (%s) (%s)", cadetDutyPositionData[i][1], (cadetDutyPositionData[i][4] == '1'? 'A' : 'P'), squadrons[cadetDutyPositionData[i][7]].charter)});
      members[cadetDutyPositionData[i][0]].dutyPositionIds.push(cadetDutyPositionData[i][1]);
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
  let folder = DriveApp.getFolderById(FOLDER_ID),
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
        let aliasEmail = member.firstName + '.' + member.lastName + EMAIL_DOMAIN;
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
      query: 'isSuspended=false isAdmin=false',
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
      if (suspensionTime > new Date(users[i].lastUpdated).getTime()) {
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
