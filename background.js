var teams = [ "Angels","Astros","Athletics","Blue Jays","Braves","Brewers","Cardinals","Cubs","D-backs","Dodgers","Giants","Indians","Mariners","Marlins","Mets","Nationals","Orioles","Padres","Phillies","Pirates","Rangers","Rays","Red Sox","Reds","Rockies","Royals","Tigers","Twins","White Sox","Yankees" ];
var teamMenuItems = [];

var teamName = "Cubs";
var timezone = "US/Central";
var teamIcon = "logos/Cubs.png";
var winIcon = "logos/win.png";
var lossIcon = "logos/loss.png";
var iconCanvas = document.createElement('canvas');

var currentlyPreGame = true;
var currentGameId = false;

var gameCompleteIconSet = "20000101";
var gametimeDataRefreshTimer = false;

chrome.alarms.create("GameUpdater", {
	when: Date.now() + 3000,
	periodInMinutes: 60
});
chrome.alarms.onAlarm.addListener(function(alarm) {
	if(alarm.name="GameUpdater") {
		updateData();
	}
});
chrome.browserAction.onClicked.addListener(function() {
	if(currentGameId) {
		if(currentlyPreGame) {
		    chrome.tabs.create({ url: "http://www.mlb.com/r/game?mode=preview&sport_code=mlb&gid=" + currentGameId });
		} else {
			//redirects to mode gameday as appropriate
		    chrome.tabs.create({ url: "http://www.mlb.com/r/game?mode=box&sport_code=mlb&gid=" + currentGameId });
		}
	} else {
	    chrome.tabs.create({url: "http://m.mlb.com/scoreboard/"});
	}
});
chrome.storage.sync.get([ 'sportsTrackerTeamName','sportsTrackerTimeZone' ], function (result) {
  if(result.sportsTrackerTeamName) {
		teamName = result.sportsTrackerTeamName;
		//console.log(teamName);
		teamIcon = "logos/" + result.sportsTrackerTeamName + ".png"
	}
	addTeamSelectorMenuOptions();
	
	if(result.sportsTrackerTimeZone) {
		timezone = result.sportsTrackerTimeZone;
	}
  addTimeZoneMenuOptions();
});
function addTeamSelectorMenuOptions() {
  var selectTeamMenuItem = chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"title":"Select Team...",
		"contexts":["browser_action"],
	});
  for (var i = 0, len = teams.length; i < len; i++) {
    var team = teams[i];
    //console.log("Adding team " + team + " index " + i);
    var menuIndex = chrome.contextMenus.create({
      "documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
      "type":"radio",
      "checked": teamName == team,
      "title":team,
      "parentId":selectTeamMenuItem,
      "contexts":["browser_action"],
      "onclick":function(info, tab) {
        //team will return the last iteration value, so we need to store the menuItemId to do a lookup on the onClick callback
        saveSelectedTeam(teamMenuItems[info.menuItemId]);
      }
    }, function() {
		if (chrome.runtime.lastError) {
			console.log("error creating menu item:" + chrome.runtime.lastError);
		}
	});
	//console.log("Menu index is " + menuIndex);
    teamMenuItems[menuIndex] = team;
  }
}
function saveSelectedTeam(newTeam) {
  //console.log(newTeam);
  teamName = newTeam;
  teamIcon = "logos/" + newTeam + ".png"
  chrome.storage.sync.set({'sportsTrackerTeamName': newTeam });
	//console.log("Team updated to " + newTeam);
	updateData();
}
function addTimeZoneMenuOptions() {
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"separator"
	});

	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": timezone == "US/Pacific",
		"title":"Pacific Time",
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			saveTimeZone("US/Pacific");
		}
	});
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": timezone == "US/Mountain",
		"title":"Mountain Time",
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			saveTimeZone("US/Mountain");
		}
	});
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": timezone == "US/Central",
		"title":"Central Time",
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			saveTimeZone("US/Central");
		}
	});
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": timezone == "US/Eastern",
		"title":"Eastern Time",
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			saveTimeZone("US/Eastern");
		}
	});
}
function saveTimeZone(newzone) {
	timezone = newzone;
	chrome.storage.sync.set({'sportsTrackerTimeZone': newzone });
	//console.log("Timezone updated to " + newzone);
	updateData();
}

function updateData() {
	var today = new Date();
	var dd = today.getDate();
	var mm = today.getMonth() + 1; //January is 0
	var yyyy = today.getFullYear();
	if(mm < 10){
	    mm = '0' + mm
	}
	if(dd < 10){
	    dd = '0' + dd
	}
	updateGameData(yyyy, mm, dd);
}

function updateGameData(yyyy, mm, dd) {
	//http://riccomini.name/posts/game-time-baby/2012-09-29-streaming-live-sports-schedule-scores-stats-api/
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open("GET", "http://gd2.mlb.com/components/game/mlb/year_" + yyyy + "/month_" + mm + "/day_" + dd + "/master_scoreboard.json", true); // false for synchronous 
	xmlHttp.send(null);
	xmlHttp.onreadystatechange = function() {
		if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
			var gameInfo = JSON.parse(xmlHttp.responseText);
			var games;

			if(gameInfo.data.games.game) {
				games = $.grep(gameInfo.data.games.game, function(game){ 
					return ( game.home_team_name == teamName || game.away_team_name == teamName ) && game.original_date == (yyyy + "/" + mm + "/" + dd) ; 
				});
			}

			//If there's only one game, game is an object rather than an array, and grep fails
			if(games && games.length == 0 && (gameInfo.data.games.game.home_team_name == teamName || gameInfo.data.games.game.away_team_name == teamName ) && gameInfo.data.games.game.original_date == (yyyy + "/" + mm + "/" + dd)) {
				games[0] = gameInfo.data.games.game;
			}

			var tagText = "No " + teamName + " game today";
			var badgeText = "";
			var icon = teamIcon;
			var gameToday = false;

			if(games && games.length > 0) {
				gameToday = true;
				//TODO: support if we get more than one game (ie if there's a double-header)
				game = games[0];
				//console.log(game);
				var myScore = 0;
				var otherScore = 0;
				var otherName = "other guys";
				var gameTime = "game time";
				var gameTimeZone = "CT"; // CT, ET, MST, PT
				var pitcher = { name_display_roster: "the pitcher" };
				var venue = game.venue;
				currentGameId = game.id.replace("/", "_").replace("/", "_").replace("/", "_").replace("-", "_").replace("-", "_");
				console.log("Selecting game ID " + currentGameId);

				if(game.home_team_name == teamName) {
					if(game.linescore) {
						myScore = game.linescore.r.home;
						otherScore = game.linescore.r.away;
					}
					otherName = game.away_team_name;
					gameTime = game.home_time;
					gameTimeZone = game.home_time_zone;
					pitcher = game.home_probable_pitcher;
				} else if (game.away_team_name == teamName) {
					if(game.linescore) {
						myScore = game.linescore.r.away;
						otherScore = game.linescore.r.home;
					}
					otherName = game.home_team_name;
					gameTime = game.away_time;
					gameTimeZone = game.away_time_zone;
					pitcher = game.away_probable_pitcher;
				}

				if(pitcher == null) {
					pitcher = game.pitcher
				}

				if(game.status.status == "Preview") {
					var localGameTime = getTzAdjustedTime(yyyy, mm, dd, gameTime, gameTimeZone);
					tagText = teamName + " vs " + otherName + " at " + venue + " will start at " + localGameTime + " " + moment.tz(timezone).format('z') + " with " + pitcher.name_display_roster + " pitching";
					badgeText = localGameTime;
					currentlyPreGame = true;
					//gameCompleteIconSet = "20000101"; //in case we haven't reset the icon when the day rolls over
				} else if(game.status.status == "Postponed" || game.status.status == "Delayed Start") {
					//reason:"Inclement Weather"
					//note:"(inclement weather)  with 0 out in the top of the 1st and a 0-0 count on Logan Forsythe."
					if(game.status.reason)
						tagText = teamName + " vs " + otherName + " at " + venue + " is postponed because of " + game.status.reason;
					else
						tagText = teamName + " vs " + otherName + " at " + venue + " is postponed";
					badgeText = "PPD";

					startInGameDataUpdateTimerIfNeeded();
					currentlyPreGame = true;
					//gameCompleteIconSet = "20000101"; //in case we haven't reset the icon when the day rolls over
				} else if (game.status.status == "Pre-Game" || game.status.status == "Warmup"){
					var localGameTime = getTzAdjustedTime(yyyy, mm, dd, gameTime, gameTimeZone);
					tagText = teamName + " vs " + otherName + " at " + venue + " will start shortly at " + localGameTime + " " + moment.tz(timezone).format('z') + " with " + pitcher.name_display_roster + " pitching";
					badgeText = localGameTime;

					startInGameDataUpdateTimerIfNeeded();
					currentlyPreGame = true;
				} else if(game.status.status == "Final" || game.status.status == "Game Over") {
					var gameResult;
					if(Number(myScore) > Number(otherScore)) {
						scoreStatus = "beat";
						icon = winIcon;
						gameCompleteIconSet = (yyyy + mm + dd);
						console.log("Set game win icon at " + gameCompleteIconSet)
					} else if(Number(myScore) < Number(otherScore)) {
						scoreStatus = "lost to";
						icon = lossIcon;
						gameCompleteIconSet = (yyyy + mm + dd);
					} else if(myScore == otherScore) {
						scoreStatus = "tied";
					}

					tagText = "The " + teamName + " " + scoreStatus + " the " + otherName + " " + myScore + "-" + otherScore + " at " + venue;
					badgeText = myScore + "-" + otherScore;

					if(gametimeDataRefreshTimer) {
						//console.log("Clearing data refresh interval for a completed game");
						window.clearInterval(gametimeDataRefreshTimer);
						gametimeDataRefreshTimer = false;
					}
					currentlyPreGame = false;
				} else if(game.status.status == "In Progress" || game.status.status == "Manager Challenge") {
					var scoreStatus;
					if(Number(myScore) > Number(otherScore)) {
						scoreStatus = "leading";
					} else if(Number(myScore) < Number(otherScore)) {
						scoreStatus = "trailing";
					} else if(Number(myScore) == Number(otherScore)) {
						scoreStatus = "tied with";
					}

					var inningString = game.status.inning;
					if (inningString == 1) {
						inningString += "st";
					} else if (inningString == 2) {
						inningString += "nd";
					} else if (inningString == 3) {
						inningString += "rd";
					} else {
						inningString += "th";
					}

					tagText = "The " + teamName + " are " + scoreStatus + " the " + otherName + " " + myScore + "-" + otherScore + " in the " + game.status.inning_state.toLowerCase() + " of the " + inningString + " with " + pitcher.name_display_roster + " pitching at " + venue + " (updated " + (new Date()).toLocaleTimeString() + ")";
					badgeText = myScore + "-" + otherScore;

					startInGameDataUpdateTimerIfNeeded();
					currentlyPreGame = false;
				} else {
					console.log("Unknown game status of " + game.status.status);
					tagText = false; //if it's an unknown state, don't change anything - this is a bug
					badgeText = false;
				}
			} else {
				tagText = "No " + teamName + " game today";
				badgeText = "";
				gameToday = false;
				currentGameId = false;
			}

			if(tagText) {
				chrome.browserAction.setTitle({title: tagText });
			}
			if(badgeText !== false) {
				chrome.browserAction.setBadgeText({text: badgeText});
			}
			drawLogo(icon, gameToday);
		}
	}
}
function startInGameDataUpdateTimerIfNeeded() {
	if(gametimeDataRefreshTimer == false) {
		//console.log("Setting data refresh interval for an active game");
		gametimeDataRefreshTimer = setInterval(updateData, 120000); //2 minutes
	}
}
function getTzAdjustedTime(yyyy, mm, dd, time, fromTimezone) {
	var fromTzString = "US/Central";
	if(fromTimezone.startsWith("C")) {
		fromTzString = "US/Central";
	} else if (fromTimezone.startsWith("E")) {
		fromTzString = "US/Eastern";
	} else if (fromTimezone.startsWith("P")) {
		fromTzString = "US/Pacific";
	} else if (fromTimezone.startsWith("M")) {
		fromTzString = "US/Mountain";
	} else {
		console.log("Unknown time zone for selected team game time: " + fromTimezone);
	}

	if(time.split(':')[0].length == 1) {
		time = "0" + time;
	}
	var centralTime = moment.tz(yyyy + "-" + mm + "-" + dd + " " + time + ":00PM", fromTzString);
	var localTime = centralTime.tz(timezone).format('hh:mm'); //HH:mm
	if(localTime[0] == '0')
		localTime = localTime.substring(1);
	return localTime;
}
function drawLogo(logoSource, useColorImage) {
	var context = iconCanvas.getContext('2d');

	var bgImage = new Image();
	bgImage.onload = function() {
    context.clearRect(0, 0, bgImage.height, bgImage.width);
		context.drawImage(bgImage, 0, 0);
		var imageData = context.getImageData(0, 0, 128, 128);
		
		if(!useColorImage) {
      for(var y = 0; y < imageData.height; y++){
       for(var x = 0; x < imageData.width; x++){
          var i = (y * 4) * imageData.width + x * 4;
          var avg = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
          imageData.data[i] = avg;
          imageData.data[i + 1] = avg;
          imageData.data[i + 2] = avg;
          if(avg > 0) {
            imageData.data[i + 3] = 100;
          }
        }
      }
    }
    
    chrome.browserAction.setIcon({
		  imageData: imageData
		});
	};
	bgImage.src = logoSource;
}