process.on( "unhandledRejection" , function( reason , p ) {
	console.error( reason, "Unhandled Rejection at Promise" , p );
	console.trace();
});
process.on( "uncaughtException" , function( err ) {
	console.error( err , "Uncaught Exception thrown" );
	console.trace();
});


const schedule = require( "node-schedule" );
var JOB_IDS = [];

// Scanners
var PUB_MED_MAN = SUBREDDIT_MAN = NATURE_MAN = SCIENCE_DIRECT_MAN = null;

( async ()=> {

	await require( "./UTILS/redisManager.js" ).initialize();
	console.log( "RedisManager Ready" );
	await require( "./UTILS/tweetManager.js" ).initialize();
	console.log( "TweetManager Ready" );

	PUB_MED_MAN = require( "./SCANNERS/pubmed.js" );
	SUBREDDIT_MAN = require( "./SCANNERS/subreddit.js" );
	NATURE_MAN = require( "./SCANNERS/nature.js" );
	NATURE_MAN = require( "./SCANNERS/nature.js" );
	SCIENCE_DIRECT_MAN = require( "./SCANNERS/scienceDirect.js" );

	JOB_IDS.push({ 
		name: "PUB_MED_HOURLY" ,
		pid: schedule.scheduleJob( "01 */1 * * *" , async function() {
			await PUB_MED_MAN.searchPublishedTodayTitle( [ "autism" , "autistic" ] );
		}
	)});

	JOB_IDS.push({
		name: "SUBREDDIT_NEW" ,
		pid: schedule.scheduleJob( "05 */1 * * *" , async function() {
			await SUBREDDIT_MAN.searchSubreddit( "science" , "new" , [ "autis" ] );
		}
	)});

	JOB_IDS.push({
		name: "SUBREDDIT_TOP" ,
		pid: schedule.scheduleJob( "10 */1 * * *" , async function() {
			await SUBREDDIT_MAN.searchSubreddit( "science" , "top" , [ "autis" ] );
		}
	)});

	JOB_IDS.push({ 
		name: "NATURE_HOURLY" ,
		pid: schedule.scheduleJob( "15 */1 * * *" , async function() {
			await NATURE_MAN.searchToday();
		}
	)});

	JOB_IDS.push({ 
		name: "SCIENCE_DIRECT_MAN" ,
		pid: schedule.scheduleJob( "20 */3 * * *" , async function() {
			await SCIENCE_DIRECT_MAN.searchToday();
		}
	)});	

})();