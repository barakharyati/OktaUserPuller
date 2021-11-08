const request = require("sync-request");
const ObjectsToCsv = require("objects-to-csv");
const fs = require("fs");
var dateFormat = require('dateformat');

var key="############"
var oktaTenant = "<my-tant>.okta.com"

const defaultOptions = {
  method: "GET",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: key
  }
};

var oktaAppsArr = [];

function oktaPagination(options, apiUrl, maxRun) {
  var responseArr = [];
  var endLoop = false;
  var loopCounter = 0;

  while (!endLoop) {
    if (loopCounter >= maxRun) {
      endLoop = true;
      continue;
    } else {
      loopCounter++;
      try {
        response = request(options.method, apiUrl, defaultOptions);
        responseArr = responseArr.concat(JSON.parse(response.getBody("utf8")));
      } catch (error) {
        throw error;
      }
      //if next header exisit
      if (response.headers.link.includes('; rel="next"')) {
        //extract url
        linkHeaders = response.headers.link.split(",");
        nextLinkHeader = linkHeaders.find(element =>
          element.match('.*; rel="next"')
        );
        apiUrl = nextLinkHeader.match('.*<(.*)>; rel="next".*')[1];
      } else {
        endLoop = true;
      }

      //.match('.*<'(.*))
    }
  }

  return responseArr;
}

// //var activeGroups = [];

var oktaApps = [];
//get okta apps
var appResponseArray = oktaPagination(
  defaultOptions,
  `https://${oktaTenant}//api/v1/apps?limit=1000`,
  100
);
console.info(appResponseArray.length + " apps pulled from Okta");
//loop all Okta Apps
var appsCounter = 0;

appResponseArray.forEach(function(app) {
  progressInformation = console.info(
    "Geting " +
      app.name +
      "data, " +
      appsCounter +
      " of " +
      appResponseArray.length +
      " is done"
  );

  appsCounter++;
  var oktaApp = {};
  oktaApp.id = app.id;
  oktaApp.name = app.name;
  oktaApp.label = app.label;
  oktaApp.status = app.status;
  oktaApp.created = app.created;
  oktaApp.lastUpdated = app.lastUpdated;
  oktaApp.signOnMode = app.signOnMode;
  if (app.settings.app.instanceType) {
    oktaApp.appType = app.settings.app.instanceType;
  } else {
    oktaApp.appType = "undefiend";
  }

  //get apps groups;
  {
    var groupsResponseArray = oktaPagination(
      defaultOptions,
      app._links.groups.href + "?limit=1000",
      100
    );
    console.info(
      "looping " +
        app.name +
        "Groups, Group count =" +
        groupsResponseArray.length
    );
    var appGroupsArr = [];
    groupsResponseArray.forEach(function(group) {
      appGroupsArr.push({
        id: group.id,
        groupLink: group._links.group.href
      });
    });
    oktaApp.AppsGroups = appGroupsArr;
  }

  //get users Info
  {
    var appUsersArr = [];
    var usersResponseArray = oktaPagination(
      defaultOptions,
      app._links.users.href + "?limit=1000",
      100 //change me
    );

    console.info(
      "looping " + app.name + "Users, Users count =" + usersResponseArray.length
    );

    usersResponseArray.forEach(function(user) {
      var userGroupName = "";
      //get user group

      if (user.scope == "USER") {
        userGroupName = "No Group";
      } else {
        try {
          userGroupName = user._links.group.name;
        } catch (error) {
          //console.log("for user=" + user.id + " there is no group");
        }
      }

      //get user creds
      {
        var userName = "";

        try {
          userName = user.credentials.userName;
        } catch (error) {
          console.warn("user=" + user.id + " username is null user");
        }

        if (userName.length == 0) {
          var userResponse = request(
            defaultOptions.method,
            user._links.user.href,
            defaultOptions
          );
          userResponseBody = JSON.parse(userResponse.getBody("utf8"));
          userName = userResponseBody.profile.login;
        }
      }

      appUsersArr.push({
        id: user.id,
        userName: userName,
        scope: user.scope,
        groupName: userGroupName,
        syncState: user.syncState,
        status: user.status
      });
    });
    //add users data to app
    oktaApp.AppsUsers = appUsersArr;
  }

  //push app to apps Array
  oktaApps.push(oktaApp);
});

//get all groups data
const allGroupsResponseArray = oktaPagination(
  defaultOptions,
  `https://${oktaTenant}//api/v1/groups?limit=1000`,
  50
);
console.info(allGroupsResponseArray.length + " pulled from Okta");

//loop Okta Users and groups
var oktaAppsByUsers = [];
var oktaAppsByGroups = [];
oktaApps.forEach(app => {
  //build apps by Groups
  app.AppsGroups.forEach(appGroup => {
    var relevantGroup = allGroupsResponseArray.find(
      ({ id }) => id == appGroup.id
    );
    oktaAppsByGroups.push({
      appId: app.id,
      appLabel: app.label,
      appLastUpdated: app.lastUpdated,
      appName: app.name,
      appStatus: app.status,
      appType:app.appType,
      appSignOnMode:app.signOnMode,
      groupId: appGroup.id,
      groupLastUpdated: relevantGroup.lastUpdated,
      groupName: relevantGroup.profile.name,
      groupDescription: relevantGroup.profile.description,
      groupFullDn: relevantGroup.profile.dn
    });
  });

  //build apps by users
  app.AppsUsers.forEach(appUser => {
    oktaAppsByUsers.push({
      appId: app.id,
      appLabel: app.label,
      appLastUpdated: app.lastUpdated,
      appName: app.name,
      appStatus: app.status,
      appType:app.appType,
      appSignOnMode:app.signOnMode,
      userId: appUser.id,
      userName: appUser.userName,
      userGroupName: appUser.groupName,
      userScope: appUser.scope,
      userAtatus: appUser.status,
      userSyncState: appUser.syncState
    });
  }); //end foreach user
}); // end foreach app

console.log("Pulling end");

async function printCsv(data, path) {
  const csv = new ObjectsToCsv(data);
  csv.toDisk(path);
  console.log("Writing Csv to: " + path);
}

dateString = dateFormat(new Date(), "yyyymmddhMMss")
dir = "c:/temp/okta/APIPull/"
dateString = dateFormat(new Date(), "yyyymmddhMMss")

filePath = 'c:/temp/oktaApiPull/'+dateString;
fs.mkdirSync(filePath)

printCsv(oktaApps, filePath +"/ApssCsv"+".csv");
printCsv(oktaAppsByUsers, filePath +"/oktaAppsByUsers.csv");
printCsv(oktaAppsByGroups, filePath +"/oktaAppsByGroups.csv");
