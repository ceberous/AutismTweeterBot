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

( async ()=> {

	await require( "./UTILS/redisManager.js" ).initialize();
	console.log( "RedisManager Ready" );
	await require( "./UTILS/tweetManager.js" ).initialize();
	console.log( "TweetManager Ready" );

	JOB_IDS.push({ 
		name: "PUB_MED_HOURLY" ,
		pid: schedule.scheduleJob( "01 */1 * * *" , async function() {
			await require( "./SCANNERS/pubmed.js" ).search( [ "autism" , "autistic" ] );
		}
	)});

	JOB_IDS.push({
		name: "SUBREDDIT_NEW" ,
		pid: schedule.scheduleJob( "05 */1 * * *" , async function() {
			await require( "./SCANNERS/subreddit.js" ).search( [ "science" , "new" , [ "autis" ] ] );
		}
	)});

	JOB_IDS.push({
		name: "SUBREDDIT_TOP" ,
		pid: schedule.scheduleJob( "10 */1 * * *" , async function() {
			await require( "./SCANNERS/subreddit.js" ).search( [ "science" , "top" , [ "autis" ] ] );
		}
	)});

	JOB_IDS.push({ 
		name: "NATURE_HOURLY" ,
		pid: schedule.scheduleJob( "15 */1 * * *" , async function() {
			await require( "./SCANNERS/nature.js" ).search();
		}
	)});

	JOB_IDS.push({ 
		name: "SCIENCE_DIRECT" ,
		pid: schedule.scheduleJob( "20 */3 * * *" , async function() {
			await require( "./SCANNERS/scienceDirect.js" ).search();
		}
	)});

	JOB_IDS.push({ 
		name: "CELL_COM" ,
		pid: schedule.scheduleJob( "25 */3 * * *" , async function() {
			await require( "./SCANNERS/cell.js" ).search( "month" );
		}
	)});

	JOB_IDS.push({ 
		name: "MDPI_COM" ,
		pid: schedule.scheduleJob( "30 */3 * * *" , async function() {
			await require( "./SCANNERS/mdpi.js" ).search();
		}
	)});

	JOB_IDS.push({ 
		name: "JMIR_COM" ,
		pid: schedule.scheduleJob( "35 */9 * * *" , async function() {
			await require( "./SCANNERS/jmir.js" ).search();
		}
	)});

	JOB_IDS.push({ 
		name: "WILEY_COM" ,
		pid: schedule.scheduleJob( "40 */1 * * *" , async function() {
			await require( "./SCANNERS/wiley.js" ).search();
		}
	)});

	JOB_IDS.push({ 
		name: "OXFORD_ACADEMIC" ,
		pid: schedule.scheduleJob( "45 */1 * * *" , async function() {
			await require( "./SCANNERS/oup.js" ).search();
		}
	)});

	JOB_IDS.push({ // fast-xml-feed
		name: "SPECTRUM_NEWS" ,
		pid: schedule.scheduleJob( "50 */1 * * *" , async function() {
			await require( "./SCANNERS/spectrumNews.js" ).search();
		}
	)});

	JOB_IDS.push({ // fast-xml-feed
		name: "SPRINGER_COM" ,
		pid: schedule.scheduleJob( "53 */1 * * *" , async function() {
			await require( "./SCANNERS/springer.js" ).search();
		}
	)});
	

	JOB_IDS.push({ // large
		name: "PLOS_ORG" ,
		pid: schedule.scheduleJob( { hour: 01 , minute: 55 } , async function() {
			await require( "./SCANNERS/plos.js" ).search();
		}
	)});


})();