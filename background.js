var teams = [ "Angels","Astros","Athletics","Blue Jays","Braves","Brewers","Cardinals","Cubs","D-backs","Dodgers","Giants","Indians","Mariners","Marlins","Mets","Nationals","Orioles","Padres","Phillies","Pirates","Rangers","Rays","Red Sox","Reds","Rockies","Royals","Tigers","Twins","White Sox","Yankees" ];
var teamMenuItems = [];
var numbers = [];
var icons = [];

var teamName = "Cubs";
var timezone = "US/Central";
var iconCanvas = document.createElement('canvas');
var apiBaseUrl = "https://statsapi.mlb.com";
var simpleGameViewModeEnabled = false;

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
chrome.storage.sync.get([ 'sportsTrackerTeamName','sportsTrackerTimeZone','sportsTrackerSimpleGameViewModeEnabled' ], function (result) {
	loadLogos();
	loadNumbers();

	if(result.sportsTrackerTeamName) {
		teamName = result.sportsTrackerTeamName;
	}
	addTeamSelectorMenuOptions();

	if(result.sportsTrackerSimpleGameViewModeEnabled) {
		simpleGameViewModeEnabled = result.sportsTrackerSimpleGameViewModeEnabled;
	}
	addSimpleGameViewModeEnabledMenuOption();
	
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
function addSimpleGameViewModeEnabledMenuOption() {
	chrome.contextMenus.create({
		"documentUrlPatterns": [ window.location.protocol + "//" + window.location.hostname + "/*" ],
		"type":"separator"
	});

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
	var dateString = yyyy + "-" + mm + "-" + dd;
	var scoreboardUrl = apiBaseUrl + "/api/v1/schedule?sportId=1&date=" + dateString + "&hydrate=linescore(runners),probablePitcher,team&language=en";
	xmlHttp.open("GET", scoreboardUrl, true); // false for synchronous 
	xmlHttp.onreadystatechange = function() {
		if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
			var gameInfo = JSON.parse(xmlHttp.responseText).dates[0].games;
			var myGames;

			if(gameInfo) {
				myGames = $.grep(gameInfo, function(game){ 
					return ( game.teams.home.team.teamName == teamName || game.teams.away.team.teamName == teamName ) && game.gameDate.includes(dateString); 
				});
			}

			if(myGames && myGames.length > 0) {
				currentGame = myGames[0];
				if(myGames.length > 1 && myGames[0].status.detailedState == "Final")
					currentGame = myGames[1];
			} else {
				currentGame = false;
			}

			if(currentGame && currentGame.status.abstractGameState == "Live")
				updateGameMatchupData(apiBaseUrl + currentGame.link);

			updateDisplay();
		}
	}
	xmlHttp.send(null);
}
function updateGameMatchupData(gameUrl) {
	var gameDetailRequest = new XMLHttpRequest();
	gameDetailRequest.open("GET", gameUrl, true); // false for synchronous 
	gameDetailRequest.onreadystatechange = function() {
		if(gameDetailRequest.readyState == 4 && gameDetailRequest.status == 200) {
			var data = JSON.parse(gameDetailRequest.responseText);
			var currentMatchup = data.liveData.plays.currentPlay.matchup;

			var pitcherUrl = apiBaseUrl + "/api/v1/people/" + currentMatchup.pitcher;
			var pitcherDetailRequest = new XMLHttpRequest();
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

	if(currentGame) {
		var game = currentGame;
		currentGameId = game.gamePk;

		var myScore = 0;
		var otherScore = 0;
		var otherName = "other guys";
		var probablePitcher = "the pitcher";
		var venue = game.venue.name;
		var venueHomeAway = "at the ballpark";

		if(game.teams.home.team.teamName == teamName) {
			if(game.linescore) {
				myScore = game.linescore.teams.home.runs;
				otherScore = game.linescore.teams.away.runs;
			}
			otherName = game.teams.away.team.teamName;
			if(game.teams.home.probablePitcher)
				probablePitcher = game.teams.home.probablePitcher.fullName;
			venueHomeAway = "at home";
		} else if (game.teams.away.team.teamName == teamName) {
			if(game.linescore) {
				myScore = game.linescore.teams.away.runs;
				otherScore = game.linescore.teams.home.runs;
			}
			otherName = game.teams.home.team.teamName;
			if(game.teams.away.probablePitcher)
				probablePitcher = game.teams.away.probablePitcher.fullName;
			venueHomeAway = "away";
		}

		//States
		// Preview - Scheduled
		// Preview - Pre-Game
		// Live - Warmup
		// Live - In Progress
		// Final - Game Over
		// Final - Final

		switch(game.status.detailedState) {
			case "Scheduled":
				var localGameTime = getTzAdjustedTime(game.gameDate);
				tagText = teamName + " vs " + otherName + " at " + venue + " will start at " + localGameTime + " " + moment.tz(timezone).format('z') + " with " + probablePitcher + " pitching";
				badgeText = localGameTime;
				stopGameTimers();
				break;
			case "Postponed": //Theoretical - not yet seen
			case "Delayed Start": //Theoretical - not yet seen
				console.log(game); //So I can tell what's available for this object when it occurs
				if(game.status.detailedState != game.status.abstractGameState)
					tagText = teamName + " vs " + otherName + " at " + venue + " is postponed because of " + game.status.detailedState;
				else
					tagText = teamName + " vs " + otherName + " at " + venue + " is postponed";
				badgeText = "PPD";

				startPreGameDataUpdateTimerIfNeeded();
				break;
			case "Pre-Game":
			case "Warmup":
				var localGameTime = getTzAdjustedTime(game.gameDate);
				tagText = teamName + " vs " + otherName + " at " + venue + " will start shortly (" + localGameTime + " " + moment.tz(timezone).format('z') + ") with " + probablePitcher + " pitching";
				badgeText = localGameTime;

				startPreGameDataUpdateTimerIfNeeded();
				break;
			case "In Progress":
			case "Manager Challenge": //Theoretical - not yet seen
				var scoreStatus;
				if(Number(myScore) > Number(otherScore)) {
					scoreStatus = "leading";
				} else if(Number(myScore) < Number(otherScore)) {
					scoreStatus = "trailing";
				} else if(Number(myScore) == Number(otherScore)) {
					scoreStatus = "tied with";
				}

				var inningString = game.linescore.currentInningOrdinal;
				var inninghalf = game.linescore.inningState.toLowerCase();
				var currentInningHalfTeam = ((game.teams.away.team.teamName == teamName) && game.linescore.isTopInning) ? teamName : otherName
				var balls = game.linescore.balls;
				var strikes = game.linescore.strikes;
				var outs = game.linescore.outs;

				var bases = "nobody on base";
				var basesLoaded = Object.getOwnPropertyNames(game.linescore.offense);
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
					inning: game.linescore.currentInning,
					isTop: game.linescore.isTopInning, 
					isMiddle: (inninghalf == "middle" || inninghalf == "end"), 
					outs: game.linescore.outs, 
					firstBase: game.linescore.offense.first, 
					secondBase: game.linescore.offense.second, 
					thirdBase: game.linescore.offense.third 
				};

				startInGameDataUpdateTimerIfNeeded();
				break;
			case "Final":
			case "Game Over":
				var gameResult;
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
				console.log("Unknown Game State to handle: " + game.status.abstractGameState + ", detailed state " + game.detailedState)
				tagText = false; //if it's an unknown state, don't change anything - this is a bug
				badgeText = false;
				break;
		}
	} else {
		tagText = "No " + teamName + " game today";
		badgeText = "";
		currentGameId = false;
		stopGameTimers();
	}

	if(tagText)
		chrome.browserAction.setTitle({title: tagText });

	if(badgeText !== false)
		chrome.browserAction.setBadgeText({text: badgeText});

	drawIcon(icon, currentGame, gameDataForIcon);
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

// Logo draw logic
function drawIcon(icon, useColorImage, gameData) {
	var context = iconCanvas.getContext('2d');

	if(gameData && !simpleGameViewModeEnabled) {
		context.clearRect(0, 0, 19, 19);

    	if(!gameData.isMiddle) {
			if(gameData.outs >= 1) 
				drawOut(context, 1);
			if(gameData.outs >= 2) 
				drawOut(context, 2);
			if(gameData.outs >= 3) 
				drawOut(context, 3);

	    	drawInningIndicator(context, gameData.isTop);
		}

		drawInningNumber(context, gameData.inning, !gameData.isMiddle && gameData.outs >= 1);

		drawBase(context, 13, 4, gameData.firstBase);
		drawBase(context, 9, 0, gameData.secondBase);
		drawBase(context, 5, 4, gameData.thirdBase);

		var imageData = getImageDataFromContext(context, 19, !useColorImage);
    
    	chrome.browserAction.setIcon({
		  imageData: imageData
		});
    } else {
    	context.clearRect(0, 0, icon.height, icon.width);
		context.drawImage(icon, 0, 0);

		var imageData = getImageDataFromContext(context, icon.height, !useColorImage);

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
