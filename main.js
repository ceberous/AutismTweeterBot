var Twitter = require("twit");
var schedule = require('node-schedule');

var personal = require("./personal.js").data;

var tBotConfig = {
    consumer_key: personal.twitter.consumer_key,
    consumer_secret: personal.twitter.consumer_secret,
    access_token: personal.twitter.access_key,
    access_token_secret: personal.twitter.access_secret
};
var tBot = new Twitter( tBotConfig );
function wSendTweet( wTweet ) {
	return new Promise( async function( resolve , reject ) {
		try {
			tBot.post( 'statuses/update' , { status: wTweet } , function( error , tweet , response ) {
				setTimeout( async function() {
					console.log( "\nTWEET SENT --> " );
					console.log( wTweet );
					resolve( response );
				} , 2000 );
			});
		}
		catch(err) { console.log( "ERROR SENDING TWEET --> " + err); reject(err); }
	});
}

async function enumerateTweets( wResults ) {
	if ( !wResults ) { return; }
	if ( wResults.length < 1 ) { return; }
	for ( var i = 0; i < wResults.length; ++i ) {
		await wSendTweet( wResults[ i ] );
	}
}

function printNowTime() {
	var today = new Date();
	var wTY = today.getFullYear();
	var wTM = ( today.getMonth() + 1 );
	var wTD = today.getDate();
	var wTH = today.getHours();
	var wTM = today.getMinutes();
	console.log(  wTY + "-" + wTM + "-" + wTD + " === " + wTH + ":" + wTM + "\n" );
}

const wPubMedManager = require("./pubmedScanner.js");
var j1 = schedule.scheduleJob( "01 */1 * * *" , async function() {
	console.log( "\nPubMed Search-Task Started @ " );
	printNowTime();
	var wR = await wPubMedManager.searchPublishedTodayTitle( [ "autism" , "autistic" ] );
	console.log( "\nPubMed Search-Task Ended @ " );
	printNowTime();	
	enumerateTweets( wR );
});

const wSubredditManager = require("./subredditScanner.js");
var j2 = schedule.scheduleJob( "05 */1 * * *" , async function(){
 	console.log( "\nSubreddit Search-New-Task Started @ " );
	printNowTime();
	var wR = await wSubredditManager.searchSubreddit( "science" , "new" , [ "autis" ] );
	console.log( "\nSubreddit Search-New-Task Ended @ " );
	printNowTime();	
	enumerateTweets( wR );
});

var j3 = schedule.scheduleJob( "10 */2 * * *" , async function(){
 	console.log( "\nSubreddit Search-Top-Task Started @ " );
	printNowTime();
	var wR = await wSubredditManager.searchSubreddit( "science" , "top" , [ "autis" ] );
	console.log( "\nSubreddit Search-Top-Task Ended @ " );
	printNowTime();	
	enumerateTweets( wR );
});