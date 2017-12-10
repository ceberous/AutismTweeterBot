const request = require( "request" );
const puppeteer = require('puppeteer');
const cheerio = require( "cheerio" );
const { map } = require( "p-iteration" );

const TweetResults = require( "../UTILS/tweetManager.js" ).enumerateTweets;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

// https://github.com/GoogleChrome/puppeteer
// https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#

const DX_DOI_BASE_URL = "http://dx.doi.org";
const SCI_HUB_BASE_URL = DX_DOI_BASE_URL + ".sci-hub.tw/";

var wResults = null;
var wFinalResults = [];

function PARSE_PUPPETEER(){
	return new Promise( function( resolve , reject ) {
		try {

			try { var $ = cheerio.load( wResults ); }
			catch(err) { reject( "cheerio load failed" ); return; }

			var wTitles = [];
			var wDOIS = [];

			$( "strong" ).each( function () {
				var wThis = $( this );
				var wID = wThis.text().trim();
				if ( wID === "dc:title" ) {
					var wTextNode = wThis.parent().siblings()[0];
					wTextNode = $( wTextNode ).text();
					wTitles.push( wTextNode );
				}
				else if ( wID === "prism:doi" ) {
					var wTextNode = wThis.parent().siblings()[0];
					wTextNode = $( wTextNode ).text();
					wDOIS.push( wTextNode );
				}
			});

			if ( wTitles.length === wDOIS.length ) {
				for ( var i = 0; i < wTitles.length; ++i ) {
					wFinalResults.push({
						doi: wDOIS[ i ] ,
						doiB64: EncodeB64( wDOIS[ i ] ) ,
						title: wTitles[ i ] ,
						mainURL:  DX_DOI_BASE_URL + "/" + wDOIS[ i ] ,
						scihubURL: SCI_HUB_BASE_URL + wDOIS[ i ]
					});
				}			
			}

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const wSearchURL_P1 = "https://www.nature.com/opensearch/request?interface=sru&query=dc.description+%3D+%22autism%22+OR+dc.subject+%3D+%22autism%22+OR+dc.title+%3D+%22autism%22+AND+prism.publicationDate+%3E+%22";
const wSearchURL_P2 = "%22&httpAccept=application%2Fsru%2Bxml&maximumRecords=100&startRecord=1&recordPacking=packed&sortKeys=publicationDate%2Cpam%2C0";
function FETCH_PUPPETEER(){
	return new Promise( async function( resolve , reject ) {
		try {
			
			// Javascript dates at their finest
			// I'm sorry... there is a better way I'm sure. but I am too dumb
			var today = new Date();
			today.setDate( today.getDate() - 30 ); // Search Previous 30 Days
			var wTY = today.getFullYear().toString();
			var wTM = ( today.getMonth() + 1 );
			if ( wTM < 10 ) { wTM = "0" + wTM.toString(); }
			else{ wTM = wTM.toString(); }
			var wTD = today.getDate();
			if ( wTD < 10 ) { wTD = "0" + wTD.toString(); }
			else{ wTD = wTD.toString(); }
			const wFinalDateString = wTY + "-" + wTM + "-" + wTD;
			const wFinalURL = wSearchURL_P1 + wFinalDateString + wSearchURL_P2;
			console.log( wFinalURL );

			const browser = await puppeteer.launch();
			const page = await browser.newPage();
			await page.goto( wFinalURL , { waitUntil: "networkidle2" });
			wResults = await page.content();
			await browser.close();
			await PARSE_PUPPETEER();

			resolve();

		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const R_NATURE_PLACEHOLDER = "SCANNERS.NATURE.PLACEHOLDER";
const R_NATURE_NEW_TRACKING = "SCANNERS.NATURE.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED_DOIS = "SCANNERS.GLOBAL.ALREADY_TRACKED.DOIS";
function SEARCH_TODAY() {
	return new Promise( async function( resolve , reject ) {
		try {
			
			// 1.) Fetch New Search Results
			await FETCH_PUPPETEER();
			console.log( wFinalResults );

			// 2.) Compare to Already 'Tracked' DOIs and Store Uneq
			var b64_DOIS = wFinalResults.map( x => x[ "doiB64" ] );
			await RU.setSetFromArray( redis , R_NATURE_PLACEHOLDER , b64_DOIS );
			await RU.setDifferenceStore( redis , R_NATURE_NEW_TRACKING , R_NATURE_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED_DOIS );
			await RU.delKey( redis , R_NATURE_PLACEHOLDER );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED_DOIS , b64_DOIS );

			const wNewTracking = await RU.getFullSet( redis , R_NATURE_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			wFinalResults = wFinalResults.filter( x => wNewTracking.indexOf( x[ "doiB64" ] ) !== -1 );
			await RU.delKey( redis , R_NATURE_NEW_TRACKING );

			// 3.) Tweet Uneq Results
			var wFormattedTweets = [];
			for ( var i = 0; i < wFinalResults.length; ++i ) {
				var wMessage = "#AutismResearchPapers ";
				if ( wFinalResults[i].title.length > 58 ) {
					wMessage = wMessage + wFinalResults[i].title.substring( 0 , 55 );
					wMessage = wMessage + "...";
				}
				else {
					wMessage = wMessage + wFinalResults[i].title.substring( 0 , 58 );
				}
				wMessage = wMessage + " " + wFinalResults[i].mainURL;
				wMessage = wMessage + " Paper: " + wFinalResults[i].scihubURL;
				wFormattedTweets.push( wMessage );
			}
			await TweetResults( wFormattedTweets );
			console.log( "\nNature.com Scan Finished" );
			PrintNowTime();

			wResults = null;
			wFinalResults = [];
			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.searchToday = SEARCH_TODAY;