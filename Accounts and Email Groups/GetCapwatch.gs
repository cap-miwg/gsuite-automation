/**
 * This scripts allows for the automation of capwatch import to google drive.
 * Author: Jeremy Ginnard, jginnard@a2cap.org
 * 
 * Step 1: Temporarily set username and password vairables, then run getAuthorization.
 * Step 2: Check logs for the string and copy to variable 'AUTHORIZATION'.
 * Step 3: Set FOLDER_ID to the ID of the folder where you want the capwatch data. Make sure you have write permission.
 * Step 4: Set the function getCapwatch to run at a set interval. Recommended, once per 24 hours during the night.
 *         Edit > Current Project's Triggers
 *         Add Trigger
 *         Choose options: getCapwatch, Head, Time-driven, Day timer, Select Time
**/

// The ID of the folder where you want to add/update data
//var CAPWATCH_FOLDER_ID = '1zfHfMuqx_jr-ZRaKL7r67wlEXo17V-NB';
// Orginization ID of the unit for which to download data
//var ORGID = '223';

/**
 * Gets capwatch data and updates specified Google Drive folder
**/
function getCapwatch() {
  let userProperties = PropertiesService.getUserProperties();
  let AUTHORIZATION = userProperties.getProperty('CAPWATCH_AUTHORIZATION');
  let url = 'https://www.capnhq.gov/CAP.CapWatchAPI.Web/api/cw?ORGID=' + ORGID + '&unitOnly=0';
  let response = UrlFetchApp.fetch(url, {'headers':{'authorization': 'Basic ' + AUTHORIZATION}});
  let files = Utilities.unzip(response.getBlob());
  let folder = DriveApp.getFolderById(CAPWATCH_FOLDER_ID);
  files.forEach(function(blob){
    var existingFiles = folder.getFilesByName(blob.getName());
    if (existingFiles.hasNext()) {
      var file = existingFiles.next();
      Logger.log('Updating: ' + file.getName());
      file.setContent(blob.getDataAsString());
    } else {
      folder.createFile(blob);
    }
  });
}

/**
 * Encodes your eServices username and password. 
 * Saves value to Properties Service accessible only by current user.
**/
function setAuthorization(){
  let username = '';
  let password = '';
  let authorization = Utilities.base64Encode(username + ':' + password);
  let userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('CAPWATCH_AUTHORIZATION', authorization);
}
