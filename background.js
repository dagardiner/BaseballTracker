var teams = [ "Angels","Astros","Athletics","Blue Jays","Braves","Brewers","Cardinals","Cubs","D-backs","Dodgers","Giants","Indians","Mariners","Marlins","Mets","Nationals","Orioles","Padres","Phillies","Pirates","Rangers","Rays","Red Sox","Reds","Rockies","Royals","Tigers","Twins","White Sox","Yankees" ];
var teamMenuItems = [];
var numbers = [];
var icons = [];

var teamName = "Cubs";
var timezone = "US/Central";
var iconCanvas = document.createElement('canvas');
var apiBaseUrl = "https://statsapi.mlb.com";
var simpleGameViewModeEnabled = false;
var homeAwayViewModeEnabled = false;

var currentGameId = false;
var currentGame = false;
var currentPitcher = false;
var currentBatter = false;

var gametimeDataRefreshPreGameInterval = 120000;
var gametimeDataRefreshInGameInterval = 30000;
var gametimeDataRefreshCurrentInterval = 0;
var gametimeDataRefreshTimer = false;

// Startup and event handlers
chrome.alarms.create("GameUpdater", {
	when: Date.now() + 3000,
	periodInMinutes: 40 //games flip from Scheduled to Pre-Game 40 minutes before first pitch
});
chrome.alarms.onAlarm.addListener(function(alarm) {
	if(alarm.name="GameUpdater") {
		updateData();
	}
});
chrome.browserAction.onClicked.addListener(function() {
	if(currentGameId) {
	    chrome.tabs.create({ url: "https://www.mlb.com/gameday/" + currentGameId });
	} else {
	    chrome.tabs.create({url: "https://www.mlb.com/scores"});
	}
});

// Startup and menu population
chrome.storage.sync.get([ 'sportsTrackerTeamName','sportsTrackerTimeZone','sportsTrackerSimpleGameViewModeEnabled', 'sportsTrackerHomeAwayViewModeEnabled' ], function (result) {
	loadLogos();
	loadNumbers();

	if(result.sportsTrackerSimpleGameViewModeEnabled) {
		simpleGameViewModeEnabled = result.sportsTrackerSimpleGameViewModeEnabled;
	}
	if(result.sportsTrackerHomeAwayViewModeEnabled) {
		homeAwayViewModeEnabled = result.sportsTrackerHomeAwayViewModeEnabled;
	}
	addViewModeMenuOptions();

	if(result.sportsTrackerTeamName) {
		teamName = result.sportsTrackerTeamName;
	}
	addTeamSelectorMenuOptions();

	
	if(result.sportsTrackerTimeZone) {
		timezone = result.sportsTrackerTimeZone;
	}
	addTimeZoneMenuOptions();
});
function loadNumbers() {
	for(var i = 1; i <= 9; i++) {
		numbers[i] = new Image();
		numbers[i].src = "numbers/" + i + ".png";
	}
	var plus = new Image();
	plus.src = "numbers/+.png";
	for(var i = 10; i <= 10; i++) {
		numbers[i] = plus;
	}
}
function loadLogos() {
	teams.forEach(function(teamName) {
		icons[teamName] = new Image();
		icons[teamName].src = "logos/" + teamName + ".png";
	});
	icons["win"] = new Image();
	icons["win"].src = "logos/win.png";

	icons["loss"] = new Image();
	icons["loss"].src = "logos/loss.png";
}
function addTeamSelectorMenuOptions() {
  var selectTeamMenuItem = chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"title":"Select Team...",
		"contexts":["browser_action"],
	});
  for (var i = 0, len = teams.length; i < len; i++) {
    var team = teams[i];
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
    teamMenuItems[menuIndex] = team;
  }
}
function saveSelectedTeam(newTeam) {
  teamName = newTeam;
  chrome.storage.sync.set({'sportsTrackerTeamName': newTeam });
	updateData();
}
function addViewModeMenuOptions() {
	//chrome.contextMenus.create({type:'separator'});

	var viewModeMenuItem = chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"title":"Select Display Mode...",
		"contexts":["browser_action"],
	});

	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": !simpleGameViewModeEnabled && !homeAwayViewModeEnabled,
		"title":"Full Game Updates",
      	"parentId":viewModeMenuItem,
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			homeAwayViewModeEnabled = false;
			simpleGameViewModeEnabled = false;
			chrome.storage.sync.set({'sportsTrackerSimpleGameViewModeEnabled': simpleGameViewModeEnabled, 'sportsTrackerHomeAwayViewModeEnabled': homeAwayViewModeEnabled });
			updateData();
		}
	});
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": simpleGameViewModeEnabled,
		"title":"Simplified In-Game View",
      	"parentId":viewModeMenuItem,
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			homeAwayViewModeEnabled = false;
			simpleGameViewModeEnabled = true;
			chrome.storage.sync.set({'sportsTrackerSimpleGameViewModeEnabled': simpleGameViewModeEnabled, 'sportsTrackerHomeAwayViewModeEnabled': homeAwayViewModeEnabled });
			updateData();
		}
	});
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": homeAwayViewModeEnabled,
		"title":"Home/Away Indicator",
      	"parentId":viewModeMenuItem,
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			stopGameTimers();
			homeAwayViewModeEnabled = true;
			simpleGameViewModeEnabled = false;
			chrome.storage.sync.set({'sportsTrackerSimpleGameViewModeEnabled': simpleGameViewModeEnabled, 'sportsTrackerHomeAwayViewModeEnabled': homeAwayViewModeEnabled });
			updateData();
		}
	});

	/*
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"checkbox",
		"checked":simpleGameViewModeEnabled,
		"title":"Enable Simplified In-Game View",
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			simpleGameViewModeEnabled = info.checked;
			chrome.storage.sync.set({'sportsTrackerSimpleGameViewModeEnabled': simpleGameViewModeEnabled });
			updateData();
		}
	});
	*/
}
function addTimeZoneMenuOptions() {
	//chrome.contextMenus.create({type:'separator'});

	var timezoneMenuItem = chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"title":"Select Time Zone...",
		"contexts":["browser_action"],
	});

	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": timezone == "US/Pacific",
		"title":"Pacific Time",
      	"parentId":timezoneMenuItem,
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			saveTimeZone("US/Pacific");
		}
	});
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": timezone == "US/Arizona",
		"title":"Arizona Time",
      	"parentId":timezoneMenuItem,
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			saveTimeZone("US/Arizona");
		}
	});
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"radio",
		"checked": timezone == "US/Mountain",
		"title":"Mountain Time",
      	"parentId":timezoneMenuItem,
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
      	"parentId":timezoneMenuItem,
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
      	"parentId":timezoneMenuItem,
		"contexts":["browser_action"],
		"onclick":function(info, tab) {
			saveTimeZone("US/Eastern");
		}
	});
}
function saveTimeZone(newzone) {
	timezone = newzone;
	chrome.storage.sync.set({'sportsTrackerTimeZone': newzone });
	updateData();
}

// Game data update request logic
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
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.timeout = 3000;
	var dateString = yyyy + "-" + mm + "-" + dd;
	var scoreboardUrl = apiBaseUrl + "/api/v1/schedule?sportId=1&date=" + dateString + "&hydrate=linescore(runners),probablePitcher,team&language=en";
	xmlHttp.open("GET", scoreboardUrl, true); // false for synchronous 
	xmlHttp.onreadystatechange = function() {
		if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
			var gamesForAllDates = JSON.parse(xmlHttp.responseText).dates;
			var gameInfo = false;
			var myGames;

			if(gamesForAllDates && gamesForAllDates.length > 0) {
				gameInfo = gamesForAllDates[0].games;
			}

			if(gameInfo) {
				myGames = $.grep(gameInfo, function(game){ 
					var localStartDate = moment.tz(game.gameDate, "UTC").tz(timezone).format('YYYY-MM-DD');
					return ( game.teams.home.team.teamName == teamName || game.teams.away.team.teamName == teamName ) && localStartDate.includes(dateString); 
				});
			}

			if(myGames && myGames.length > 0) {
				currentGame = myGames[0];
				if(myGames.length > 1 && myGames[0].status.detailedState == "Final")
					currentGame = myGames[1];
			} else {
				currentGame = false;
			}

			if(currentGame && currentGame.status.abstractGameState == "Live" && !homeAwayViewModeEnabled)
				updateGameMatchupData(apiBaseUrl + currentGame.link);

			updateDisplay();
		}
	}
	xmlHttp.send(null);
}
function updateGameMatchupData(gameUrl) {
	var gameDetailRequest = new XMLHttpRequest();
	gameDetailRequest.timeout = 3000;
	gameDetailRequest.open("GET", gameUrl, true); // false for synchronous 
	gameDetailRequest.onreadystatechange = function() {
		if(gameDetailRequest.readyState == 4 && gameDetailRequest.status == 200) {
			var data = JSON.parse(gameDetailRequest.responseText);
			var currentMatchup = data.liveData.plays.currentPlay.matchup;

			var pitcherUrl = apiBaseUrl + "/api/v1/people/" + currentMatchup.pitcher;
			var pitcherDetailRequest = new XMLHttpRequest();
			pitcherDetailRequest.timeout = 3000;
			pitcherDetailRequest.open("GET", pitcherUrl , true); // false for synchronous 
			pitcherDetailRequest.onreadystatechange = function() {
				if(pitcherDetailRequest.readyState == 4 && pitcherDetailRequest.status == 200) {
					currentPitcher = JSON.parse(pitcherDetailRequest.responseText).people[0];
					updateDisplay();
				}
			}
			pitcherDetailRequest.send(null);

			var batterUrl = apiBaseUrl + "/api/v1/people/" + currentMatchup.batter;
			var batterDetailRequest = new XMLHttpRequest();
			batterDetailRequest.timeout = 3000;
			batterDetailRequest.open("GET", batterUrl , true); // false for synchronous 
			batterDetailRequest.onreadystatechange = function() {
				if(batterDetailRequest.readyState == 4 && batterDetailRequest.status == 200) {
					currentBatter = JSON.parse(batterDetailRequest.responseText).people[0];
					updateDisplay();
				}
			}
			batterDetailRequest.send(null);
		}
	}
	gameDetailRequest.send(null);
}
function startPreGameDataUpdateTimerIfNeeded() {
	if(gametimeDataRefreshCurrentInterval != gametimeDataRefreshPreGameInterval)
		stopGameTimers();

	if(gametimeDataRefreshTimer == false)
		gametimeDataRefreshTimer = setInterval(updateData, gametimeDataRefreshPreGameInterval);
}
function startInGameDataUpdateTimerIfNeeded() {
	if(gametimeDataRefreshCurrentInterval != gametimeDataRefreshInGameInterval)
		stopGameTimers();
	
	if(gametimeDataRefreshTimer == false) {
		gametimeDataRefreshTimer = setInterval(updateData, gametimeDataRefreshInGameInterval);
	}
}
function stopGameTimers() {
	if(gametimeDataRefreshTimer) {
		window.clearInterval(gametimeDataRefreshTimer);
		gametimeDataRefreshTimer = false;
	}
}

// UI update logic
function updateDisplay() {
	var tagText = false;
	var badgeText = "";
	var icon = icons[teamName];
	var gameDataForIcon = false;

	if(homeAwayViewModeEnabled) {
		if(currentGame && currentGame.teams.home.team.teamName == teamName) {
			var localGameTime = getTzAdjustedTime(currentGame.gameDate);
			tagText = "The " + teamName + " have a home game against the " + currentGame.teams.away.team.teamName + " at " + localGameTime + " " + moment.tz(timezone).format('z');
			badgeText = localGameTime;
		}
		else {
			tagText = "The " + teamName +" are not playing at home today";
			badgeText = "";
		}
	}
	else if(currentGame) {
		currentGameId = currentGame.gamePk;

		var myScore = 0;
		var otherScore = 0;
		var otherName = "other guys";
		var probablePitcher = "the pitcher";
		var venue = currentGame.venue.name;
		var venueHomeAway = "at the ballpark";

		if(currentGame.teams.home.team.teamName == teamName) {
			if(currentGame.linescore) {
				myScore = currentGame.linescore.teams.home.runs;
				otherScore = currentGame.linescore.teams.away.runs;
			}
			otherName = currentGame.teams.away.team.teamName;
			if(currentGame.teams.home.probablePitcher)
				probablePitcher = currentGame.teams.home.probablePitcher.fullName;
			venueHomeAway = "at home";
		} else if (currentGame.teams.away.team.teamName == teamName) {
			if(currentGame.linescore) {
				myScore = currentGame.linescore.teams.away.runs;
				otherScore = currentGame.linescore.teams.home.runs;
			}
			otherName = currentGame.teams.home.team.teamName;
			if(currentGame.teams.away.probablePitcher)
				probablePitcher = currentGame.teams.away.probablePitcher.fullName;
			venueHomeAway = "away";
		}

		//States
		// Preview - Scheduled
		// Preview - Pre-Game
		// Live - Warmup
		// Live - In Progress
		// Final - Game Over
		// Final - Final
		var gameState = "Unknown";
		switch(currentGame.status.detailedState) {
			case "Scheduled":
				gameState = "Scheduled";
				break;
			case "Cancelled":
				gameState = "Cancelled";
				break;
			case "Postponed": //Theoretical - not yet seen
			case "Delayed Start":
				gameState = "Delayed";
				break;
			case "Pre-Game":
			case "Warmup":
				gameState = "Pre-Game";
				break;
			case "In Progress":
			case "Manager Challenge": //Theoretical - not yet seen
				gameState = "In Progress";
				break;
			case "Final":
			case "Game Over":
			case "Completed Early":
				gameState = "Final";
				break;
			default:
				console.log("Unknown Game State to handle: " + currentGame.status.abstractGameState + ", detailed state " + currentGame.status.detailedState + ".  Defaulting to Abstract Status mapping.");
				switch(currentGame.status.abstractGameState) {
					case "Preview":
						gameState = "Scheduled";
						break;
					case "Live":
						gameState = "In Progress";
						break;
					case "Final":
						gameState = "Final";
						break;
					default:
						console.log("Did not recognize Abstract Status either.");
						gameState = "Scheduled";
						break;
				}
				break;
		}

		switch(gameState) {
			case "Scheduled":
				var localGameTime = getTzAdjustedTime(currentGame.gameDate);
				tagText = teamName + " vs " + otherName + " at " + venue + " will start at " + localGameTime + " " + moment.tz(timezone).format('z') + " with " + probablePitcher + " pitching";
				badgeText = localGameTime;
				stopGameTimers();
				break;
			case "Cancelled":
				tagText = teamName + " vs " + otherName + " at " + venue + " has been cancelled";
				badgeText = "";
				stopGameTimers();
				break;
			case "Delayed":
				console.log(currentGame.status); //So I can tell what's available for this object when it occurs
				if(currentGame.status.detailedState != currentGame.status.abstractGameState) {
					tagText = teamName + " vs " + otherName + " at " + venue + " is " + currentGame.status.detailedState + " because of " + currentGame.status.reason;
					if(currentGame.status.abstractGameState == "Final") tagText += " (Final)";
				}
				else {
					tagText = teamName + " vs " + otherName + " at " + venue + " is postponed";
				}
				badgeText = "PPD";

				startPreGameDataUpdateTimerIfNeeded();
				break;
			case "Pre-Game":
				var localGameTime = getTzAdjustedTime(currentGame.gameDate);
				tagText = teamName + " vs " + otherName + " at " + venue + " will start shortly (" + localGameTime + " " + moment.tz(timezone).format('z') + ") with " + probablePitcher + " pitching";
				badgeText = localGameTime;

				startPreGameDataUpdateTimerIfNeeded();
				break;
			case "In Progress":
				var scoreStatus;
				if(Number(myScore) > Number(otherScore)) {
					scoreStatus = "leading";
				} else if(Number(myScore) < Number(otherScore)) {
					scoreStatus = "trailing";
				} else if(Number(myScore) == Number(otherScore)) {
					scoreStatus = "tied with";
				}

				var inningString = currentGame.linescore.currentInningOrdinal;
				var inninghalf = currentGame.linescore.inningState.toLowerCase();
				var currentInningHalfTeam = currentGame.linescore.isTopInning ? currentGame.teams.away.team.teamName : currentGame.teams.home.team.teamName
				var balls = currentGame.linescore.balls;
				var strikes = currentGame.linescore.strikes;
				var outs = currentGame.linescore.outs;

				var bases = "nobody on base";
				var basesLoaded = Object.getOwnPropertyNames(currentGame.linescore.offense);
				if(basesLoaded.length > 0) {
					bases = "runners on ";
					bases += basesLoaded.join(", ").split('').reverse().join('').replace(',','dna ').split('').reverse().join('').replace("first", "1st").replace("second", "2nd").replace("third", "3rd");
				}

				var pitcherBlurb = "";
				if(currentPitcher) {
					pitcherBlurb = " with " + currentPitcher.fullName + " pitching";
					if(currentBatter)
						pitcherBlurb += " to " + currentBatter.fullName;
				}

				tagText = teamName + " are " +  venueHomeAway + ", " + scoreStatus + " the " + otherName + " " + myScore + "-" + otherScore + " in the " + inninghalf + " of the " + inningString + pitcherBlurb + ". "
							+ currentInningHalfTeam + " have " + bases + " with " + balls + " ball" + sip(balls) + ", " + strikes + " strike" + sip(strikes) + ", and " + outs + " out" + sip(outs)
							 + " (" + (new Date()).toLocaleTimeString() + ")";
				badgeText = myScore + "-" + otherScore;

				gameDataForIcon = { 
					inning: currentGame.linescore.currentInning,
					isTop: currentGame.linescore.isTopInning, 
					isMiddle: (inninghalf == "middle"), 
					outs: currentGame.linescore.outs, 
					firstBase: currentGame.linescore.offense.first, 
					secondBase: currentGame.linescore.offense.second, 
					thirdBase: currentGame.linescore.offense.third 
				};

				startInGameDataUpdateTimerIfNeeded();
				break;
			case "Final":
				if(Number(myScore) > Number(otherScore)) {
					scoreStatus = "beat";
					icon = icons["win"];
				} else if(Number(myScore) < Number(otherScore)) {
					scoreStatus = "lost to";
					icon = icons["loss"];
				} else if(myScore == otherScore) {
					scoreStatus = "tied";
				}

				tagText = "The " + teamName + " " + scoreStatus + " the " + otherName + " " + myScore + "-" + otherScore + " at " + venue;
				badgeText = myScore + "-" + otherScore;

				stopGameTimers();
				currentPitcher = false;
				currentBatter = false;
				break;
			default:
				console.log("Unknown Game State of " + gameState + "; no idea how we got here.")
				tagText = false; //if it's an unknown state, don't change anything - this is a bug
				badgeText = false;
				break;
		}
	} 
	else {
		tagText = "No " + teamName + " game today";
		badgeText = "";
		currentGameId = false;
		stopGameTimers();
	}

	setIconText(tagText, badgeText);
	drawIcon(icon, gameDataForIcon);
}
function getTzAdjustedTime(utcTimeString) {
	var localTime = moment.tz(utcTimeString, "UTC").tz(timezone).format('hh:mm');
	if(localTime[0] == '0')
		localTime = localTime.substring(1);
	return localTime;
}
function sip(number) {
	//Returns "s" if the number requires the label to be plural
	if(number == 1)
		return "";
	return "s";
}

function setIconText(tagText, badgeText) {
	if(tagText)
		chrome.browserAction.setTitle({title: tagText });

	if(badgeText !== false)
		chrome.browserAction.setBadgeText({text: badgeText});
}

// Logo draw logic
function drawIcon(icon, gameData) {
	var context = iconCanvas.getContext('2d');

	if(homeAwayViewModeEnabled) {
		context.clearRect(0, 0, icon.height, icon.width);
		context.drawImage(icon, 0, 0);

		var imageData = getImageDataFromContext(context, icon.height, !(currentGame && currentGame.teams.home.team.teamName == teamName));

    	chrome.browserAction.setIcon({
		  imageData: imageData
		});
	}
	else if(gameData && !simpleGameViewModeEnabled) {
		context.clearRect(0, 0, 19, 19);

    	if(!gameData.isMiddle) {
			if(gameData.outs >= 1) 
				drawOut(context, 1);
			if(gameData.outs >= 2) 
				drawOut(context, 2);
			if(gameData.outs >= 3) 
				drawOut(context, 3);
		}

    	drawInningIndicator(context, gameData.isTop);

		drawInningNumber(context, gameData.inning, !gameData.isMiddle && gameData.outs >= 1);

		drawBase(context, 13, 4, gameData.firstBase);
		drawBase(context, 9, 0, gameData.secondBase);
		drawBase(context, 5, 4, gameData.thirdBase);

		var imageData = getImageDataFromContext(context, 19, !currentGame);
    
    	chrome.browserAction.setIcon({
		  imageData: imageData
		});
    } 
    else {
    	context.clearRect(0, 0, icon.height, icon.width);
		context.drawImage(icon, 0, 0);

		var imageData = getImageDataFromContext(context, icon.height, !currentGame);

    	chrome.browserAction.setIcon({
		  imageData: imageData
		});
	}
}
function drawInningIndicator(context, isTop) {
	if(isTop) {
		context.moveTo(0, 0);
		context.beginPath();
		context.lineTo(0, 4);
		context.lineTo(4, 0);
		context.lineTo(0, 0);
	} else {
		context.moveTo(0, 19);
		context.beginPath();
		context.lineTo(0, 15);
		context.lineTo(4, 19);
		context.lineTo(0, 19);
	}

	context.lineWidth = 1;
	context.strokeStyle = "#000";
	context.stroke();
	context.closePath();
	context.fillStyle = "#000";
	context.fill();
}
function drawInningNumber(context, inningNumber, setWhiteText) {
	context.drawImage(numbers[inningNumber], 15, 1);
	if(setWhiteText) {
		var imageData = context.getImageData(0, 0, 19, 19);
		for(var y = 1; y <= 5; y++){
			for(var x = 15; x < 19; x++){
				var i = (y * 4) * imageData.width + x * 4;
				var colorSum = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]);
				if(colorSum == 0) {
					imageData.data[i] = 255;
					imageData.data[i + 1] = 255;
					imageData.data[i + 2] = 255;
					imageData.data[i + 3] = 255;
				}
			}
		}
		context.putImageData(imageData, 0, 0);
	}
}
function drawBase(context, startX, startY, baseLoaded) {
	var radius = 4;
	context.moveTo(startX, startY);
	context.beginPath();
	context.lineTo(startX + radius, startY + radius);
	context.lineTo(startX, startY + radius + radius);
	context.lineTo(startX - radius, startY + radius);
	context.lineTo(startX, startY);
	context.lineWidth = 1;
	context.strokeStyle = "#000";
	context.stroke();
	context.closePath();
	context.fillStyle = baseLoaded ? "#090" : "#CCA";
	context.fill();
}
function drawOut(context, outNumber) {
	if(outNumber == 1) {
		context.moveTo(19, 0);
		context.beginPath();
		context.lineTo(19, 10);
		context.lineTo(10, 0);
		context.lineTo(19, 0);
	} else if (outNumber == 2) {
		context.moveTo(0, 0);
		context.beginPath();
		context.lineTo(0, 9);
		context.lineTo(9, 0);
		context.lineTo(0, 0);
	} else if (outNumber == 3) {
		context.moveTo(0, 19);
		context.beginPath();
		context.lineTo(0, 10);
		context.lineTo(10, 19);
		context.lineTo(0, 19);
	}

	context.lineWidth = 1;
	context.strokeStyle = "#D00";
	context.stroke();
	context.closePath();
	context.fillStyle = "#D00";
	context.fill();
}
function getImageDataFromContext(context, imageSize, makeGreyscale) {
	var imageData = context.getImageData(0, 0, imageSize, imageSize);
		
	if(makeGreyscale) {
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

	return imageData;
}
