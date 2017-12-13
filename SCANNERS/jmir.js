const cheerio = require( "cheerio" );

const TweetResults = require( "../UTILS/tweetManager.js" ).enumerateTweets;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const MakeRequest = require( "../UTILS/genericUtils.js" ).makeRequest;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

const MPDI_BASE_URL = "http://www.mdpi.com";
const DX_DOI_BASE_URL = "http://dx.doi.org";
const SCI_HUB_BASE_URL = DX_DOI_BASE_URL + ".sci-hub.tw/";

const JMIR_SEARCH_URL_P1 = "http://www.jmir.org/search/searchResult?field%5B%5D=date-accepted&criteria%5B%5D=1&startDate%5B%5D=";
const JMIR_SEARCH_URL_P2 = "&endDate%5B%5D=";
const JMIR_SEARCH_URL_P3 = "&operator%5B%5D=AND&field%5B%5D=title&criteria%5B%5D=autism&operator%5B%5D=OR&field%5B%5D=abstract&criteria%5B%5D=autism";

const JMIR_JSON_URL_P1 = "http://www.jmir.org/zzz/query?field%5B%5D=date-accepted&criteria%5B%5D=1&startDate%5B%5D=";
const JMIR_JSON_URL_P2 = "&endDate%5B%5D=";
const JMIR_JSON_URL_P3 = "&operator%5B%5D=AND&field%5B%5D=title&criteria%5B%5D=autism&operator%5B%5D=OR&field%5B%5D=abstract&criteria%5B%5D=autism&page=1&sort=&filter=All%20Journals";

// curl 'http://www.jmir.org/zzz/query?field%5B%5D=date-accepted&criteria%5B%5D=1&startDate%5B%5D=2017-4-12&endDate%5B%5D=2017-12-12&operator%5B%5D=AND&field%5B%5D=title&criteria%5B%5D=autism&operator%5B%5D=OR&field%5B%5D=abstract&criteria%5B%5D=autism&page=1&sort=&filter=All%20Journals' -H 'Cookie: OJSSID=39cd6e3f840cfbb3864ce311b1492e4c; linkedin_oauth_77jej2tj08s872_crc=null' -H 'Accept-Encoding: gzip, deflate' -H 'Accept-Language: en-GB,en;q=0.9,en-US;q=0.8,es;q=0.7' -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36' -H 'Accept: application/json, text/javascript, */*; q=0.01' -H 'Referer: http://www.jmir.org/search/searchResult?field%5B%5D=date-accepted&criteria%5B%5D=1&startDate%5B%5D=2017-4-12&endDate%5B%5D=2017-12-12&operator%5B%5D=AND&field%5B%5D=title&criteria%5B%5D=autism&operator%5B%5D=OR&field%5B%5D=abstract&criteria%5B%5D=autism' -H 'X-Requested-With: XMLHttpRequest' -H 'Connection: keep-alive' --compressed

function GET_TIME_NOW_URL() {

	var today = new Date();
	var wTY = today.getFullYear();
	var wTM = ( today.getMonth() + 1 );
	var wTD = today.getDate();
	var wEndDate = wTY + "-" + wTM + "-" + wTD;

	// var previous = new Date( new Date().setDate( new Date().getDate() - 30 ) );
	var previous = new Date( new Date().setDate( new Date().getDate() - 244 ) );
	var wPY = previous.getFullYear();
	var wPM = ( previous.getMonth() + 1 );
	var wPD = previous.getDate();
	var wStartDate = wPY + "-" + wPM + "-" + wPD;

	//return JMIR_SEARCH_URL_P1 + wStartDate + JMIR_SEARCH_URL_P2 + wEndDate + JMIR_SEARCH_URL_P3; 
	return JMIR_JSON_URL_P1 + wStartDate + JMIR_JSON_URL_P2 + wEndDate + JMIR_JSON_URL_P3;

}

function PARSE_JSON_RESULTS( wBody ) {
	var finalResults = [];
	if ( wBody[ "docs" ] ) {
		for ( var i = 0; i < wBody[ "docs" ].length; ++i ) {
			finalResults.push({
				title: wBody[ "docs" ][ i ][ "title" ] ,
				doi: wBody[ "docs" ][ i ][ "doi" ] ,
				doiB64: EncodeB64( wBody[ "docs" ][ i ][ "doi" ] ) ,
				mainURL: wBody[ "docs" ][ i ][ "url" ] ,
				scihubURL: wBody[ "docs" ][ i ][ "pdfUrl" ] ,
			});
		}
	}
	return finalResults;
}

function PARSE_HTML_RESULTS( wBody ) {
	return new Promise( function( resolve , reject ) {
		try {

			try { var $ = cheerio.load( wBody ); }
			catch(err) { reject( "cheerio load failed" ); return; }
			console.log( $( "body" ).html() );

			var finalResults = [];
			// $( "article" ).each( function() {
			// 	var wTitle = 
			// });

			// $( "div[data-doi]" )

			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const R_JMIR_PLACEHOLDER = "SCANNERS.JMIR.PLACEHOLDER";
const R_JMIR_NEW_TRACKING = "SCANNERS.JMIR.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED_DOIS = "SCANNERS.GLOBAL.ALREADY_TRACKED.DOIS";
function SEARCH() {
	return new Promise( async function( resolve , reject ) {
		try {

			console.log( "" );
			console.log( "\nJMIR.org Scan Started" );
			PrintNowTime();
			
			// 1.) Get Results
			var wSearchURL = GET_TIME_NOW_URL();
			var wResults = await MakeRequest( wSearchURL );
			try { 
				wResults = JSON.parse( wResults ); 
				if ( wResults[ "response" ] ) { wResults = PARSE_JSON_RESULTS( wResults[ "response" ] ); }
			}
			catch( e ) { wResults = await PARSE_RESULTS( wResults ); }
			console.log( wResults );

			// 2.) Compare to Already 'Tracked' DOIs and Store Uneq
			var b64_DOIS = wResults.map( x => x[ "doiB64" ] );
			await RU.setSetFromArray( redis , R_JMIR_PLACEHOLDER , b64_DOIS );
			await RU.setDifferenceStore( redis , R_JMIR_NEW_TRACKING , R_JMIR_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED_DOIS );
			await RU.delKey( redis , R_JMIR_PLACEHOLDER );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED_DOIS , b64_DOIS );

			const wNewTracking = await RU.getFullSet( redis , R_JMIR_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			wResults = wResults.filter( x => wNewTracking.indexOf( x[ "doiB64" ] ) !== -1 );
			await RU.delKey( redis , R_JMIR_NEW_TRACKING );

			// 3.) Tweet Uneq Results
			var wFormattedTweets = [];
			for ( var i = 0; i < wResults.length; ++i ) {
				var wMessage = "#AutismResearchPapers ";
				if ( wResults[i].title.length > 58 ) {
					wMessage = wMessage + wResults[i].title.substring( 0 , 55 );
					wMessage = wMessage + "...";
				}
				else {
					wMessage = wMessage + wResults[i].title.substring( 0 , 58 );
				}
				wMessage = wMessage + " " + wResults[i].mainURL;
				wMessage = wMessage + " Paper: " + wResults[i].scihubURL;
				wFormattedTweets.push( wMessage );
			}
			console.log( wFormattedTweets );
			await TweetResults( wFormattedTweets );
			
			console.log( "" );
			console.log( "\nJMIR.org Scan Finished" );
			PrintNowTime();
			resolve();

		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SEARCH;