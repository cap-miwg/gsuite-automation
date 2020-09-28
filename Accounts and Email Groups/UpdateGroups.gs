function updateEmailGroups() {
  let start = new Date();
  let deltas = getEmailGroupDeltas(),
      errorEmails = {};
  for(var category in deltas) {
    for (var group in deltas[category]) {
      let added = 0,
          removed = 0;
      let groupEmail = group + EMAIL_DOMAIN;
      for (var email in deltas[category][group]) {
        switch(deltas[category][group][email]) {
          case -1:
            //Remove member
            try {
              AdminDirectory.Members.remove(groupEmail, email);
              removed++;
            } catch (e) {
              console.log('Failed to remove member ' + email + ' from ' + groupEmail + ': ', e);
            }
            break;
          case 1:
            //Add member
            try {
              AdminDirectory.Members.insert({
                email: email,
                role: 'MEMBER'
              }, groupEmail);
              added++;
            } catch (e) {
              console.log('Failed to add member ' + email + ' to ' + groupEmail + ': ', e);
              if ([400,404].indexOf(e.details.code) > -1) {
                errorEmails[email] = group;
              }
            }
            break;
          case 0:
            //Do nothing, member already added
            break;
        }
      }
      console.log('Updated group ' + groupEmail + ': added ' + added + ', removed ' + removed);
    }
  }
  console.log('Updated all email groups: ' +  (new Date() - start) + 'ms');
  //Handle Error Emails
  saveErrorEmails(errorEmails);
}

function getEmailGroupDeltas() {
  let start = new Date();
  let groups = {};
  let groupsConfig = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID).getSheetByName('Groups').getDataRange().getValues();
  let squadrons = getSquadrons();
  let members = getMembers();
  for(var i=1; i < groupsConfig.length; i++) {
    groups[groupsConfig[i][1]] = getGroupMembers(groupsConfig[i][1], groupsConfig[i][2], groupsConfig[i][3], members, squadrons);
  }
  //Set Deltas
  for (var category in groups) {
    for(var group in groups[category]) {
      let currentMembers = getCurrentGroup(group);
      for (var i = 0; i < currentMembers.length; i++) {
        if (groups[category][group][currentMembers[i]]) {
          //Member already in group
          groups[category][group][currentMembers[i]] = 0;
        } else {
          //Remove member from group
          groups[category][group][currentMembers[i]] = -1;
        }
      }
    }
  }
  saveEmailGroups(groups);
  console.log('Generated deltas:' + (new Date() - start) + 'ms');
  return groups;
}

function getGroupMembers(groupName, attribute, attributeValues, members, squadrons) {
  let groups = {};
  let wingGroupId = 'miwg.' + groupName;
  let values = attributeValues.split(',');
  groups[wingGroupId] = {}; 
  switch (attribute) {
    case 'type':
    case 'dutyPositionIds':
    case 'rank':
      for(var member in members) {
        if (((typeof members[member][attribute] === 'string' && values.indexOf(members[member][attribute]) > -1) || members[member][attribute].indexOf(values[0]) > -1) && members[member].email) {
          groups[wingGroupId][members[member].email] = 1;
          let groupId = members[member].group? (squadrons[members[member].orgid].wing.toLowerCase() +squadrons[members[member].group].unit + '.' + groupName) : '';
          if (groupId) {
            if (!groups[groupId]) {
              groups[groupId] = {};
            }
            groups[groupId][members[member].email] = 1;
          }
        }
      }
      break;
    case 'acheivements':
      let acheivements = parseFile('MbrAchievements');
      for(var i =0; i < acheivements.length; i++) {
        if (members[acheivements[i][0]] && values.indexOf(acheivements[i][1]) > -1 && ['ACTIVE', 'TRAINING'].indexOf(acheivements[i][2]) > -1) {
          groups[wingGroupId][members[acheivements[i][0]].email] = 1;
          let groupId = members[acheivements[i][0]].group? (squadrons[members[acheivements[i][0]].orgid].wing.toLowerCase() +squadrons[members[acheivements[i][0]].group].unit + '.' + groupName) : '';
          if (groupId) {
            if (!groups[groupId]) {
              groups[groupId] = {};
            }
            groups[groupId][members[acheivements[i][0]].email] = 1;
          }
        }
      }
      break;
      
    case 'contact':
      let contacts = parseFile('MbrContact');
      for (var i = 0; i < contacts.length; i++) {
        if (members[contacts[i][0]] && attributeValues.indexOf(contacts[i][1]) > -1 && contacts[i][6] !== 'TRUE') {
          let contact =  contacts[i][3].toLowerCase();
          groups[wingGroupId][contact] = 1;
          let groupId = members[contacts[i][0]].group? (squadrons[members[contacts[i][0]].orgid].wing.toLowerCase() +squadrons[members[contacts[i][0]].group].unit + '.' + groupName) : '';
          if (groupId) {
            if (!groups[groupId]) {
              groups[groupId] = {};
            }
            groups[groupId][contact] = 1;
          }
        }
      }
      break;
    default:
  }
  return groups;
}

function saveEmailGroups(emailGroups) {
  let folder = DriveApp.getFolderById(FOLDER_ID),
      files = folder.getFilesByName('EmailGroups.txt');
  if (files.hasNext()) {
    let file = files.next(),
        content = JSON.stringify(emailGroups);
    file.setContent(content);
    console.log('Saved email groups to EmailGroups.txt');
  }
}

function saveErrorEmails(errorEmails) {
  let emailArray = [];
  for(var email in errorEmails) {
    emailArray.push(email);
  }
  let contacts = parseFile('MbrContact'),
      emailMap = contacts.reduce(function(map, obj) {
        map[obj[3]] = obj[0];
        return map;
      }, {});
  let sheet = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID).getSheetByName('Error Emails');
  let values = emailArray.map(function(email) {
    return [email, emailMap[email]];
  })
  sheet.getRange('A2:B' + (values.length + 1)).setValues(values);
  console.log('Saved error emails to spreadsheet \'Error Emails.\'');
}

function getCurrentGroup(groupId) {
  let email = groupId + EMAIL_DOMAIN,
    members = [],
    nextPageToken = '';
  try {
    do {
      let page = AdminDirectory.Members.list(email, {
        roles: 'MEMBER',
        maxResults: 200,
        pageToken: nextPageToken
      });
      if (page.members) {
        members = members.concat(page.members.map(function(member) {return member.email.toLowerCase()}));
      }
      nextPageToken = page.nextPageToken;
    } while(nextPageToken)
  } catch(e) {
    let error = e;
    console.log(e);
    if (e.details.code === 404) {
      //Group Not Found, Create One
      let newGroup = AdminDirectory.Groups.insert({
        email: groupId + EMAIL_DOMAIN,
        name: groupId
      });
      console.log('Group created: ', newGroup.email);
    }
  }
  return members;
}
