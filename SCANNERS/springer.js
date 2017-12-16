const request = require( "request" );
const FeedParser = require( "feedparser" );

const TweetResults = require( "../UTILS/tweetManager.js" ).formatPapersAndTweet;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );


const SPRINGER_SEARCH_URL_P1 = "https://link.springer.com/search.rss?date-facet-mode=between&sortOrder=newestFirst&facet-end-year="
const SPRINGER_SEARCH_URL_P2 = "&facet-start-year=";
const SPRINGER_SEARCH_URL_P3 = "&query=autism&dc.title=autism&showAll=true&facet-content-type=%22Article%22";

const DX_DOI_BASE_URL = "http://dx.doi.org";
const SCI_HUB_BASE_URL = DX_DOI_BASE_URL + ".sci-hub.tw/";

const SPEC_SEARCH_TERMS = [ "autism" , "autistic" , "ASD" ];
function scanText( wText ) {
	
	for ( var i = 0; i < SPEC_SEARCH_TERMS.length; ++i ) {
		var wSTResult = wText.indexOf( SPEC_SEARCH_TERMS[ i ] );
		if ( wSTResult !== -1 ) {
			return true;
		}
	}
	
	return false;
}

function TRY_REQUEST( wURL ) {
	return new Promise( function( resolve , reject ) {
		try {

			var wResults = [];
			var feedparser = new FeedParser( [{ "normalize": true , "feedurl": wURL }] );
			feedparser.on( "error" , function( error ) { console.log( error ); reject( error ); } );
			feedparser.on( "readable" , function () {
				var stream = this; 
				var item;
				while ( item = stream.read() ) { wResults.push( item ); }
			});

			feedparser.on( "end" , function() {
				resolve( wResults );
			});

			var wReq = request( wURL );
			wReq.on( "error" , function( error ) { console.log( error ); resolve( error ); });
			wReq.on( "response" , function( res ){
				var stream = this;
				if ( res.statusCode !== 200) { console.log( "bad status code" ); resolve("null"); return; }
				else { stream.pipe( feedparser ); }
			});

		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function fetchXML( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {
			
			console.log( "Searching --> " + wURL );
			var wResults = [];

			var RETRY_COUNT = 3;
			var SUCCESS = false;

			while ( !SUCCESS ) {
				if ( RETRY_COUNT < 0 ) { SUCCESS = true; }
				wResults = await TRY_REQUEST( wURL );
				if ( wResults !== "null" ) { SUCCESS = true; }
				else { 
					console.log( "retrying again" );
					RETRY_COUNT = RETRY_COUNT - 1;
					await wSleep( 2000 );
				}
			}
			resolve( wResults );

		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function PARSE_XML_RESULTS( wResults ) {
	return new Promise( function( resolve , reject ) {
		try {

			var finalResults = [];
			for ( var i = 0; i < wResults.length; ++i ) {

				var wTitle = wResults[ i ][ "title" ];
				if ( wTitle ) { wTitle = wTitle.trim(); }
				var wFoundInTitle = scanText( wTitle );
				var wDescription = wResults[ i ][ "rss:description" ][ "#" ];
				if ( wDescription ) { wDescription = wDescription.trim(); }
				var wFoundInDescription = scanText( wDescription );

				if ( wFoundInTitle || wFoundInDescription ) {
					var wMainURL = wResults[ i ][ "link" ];
					var wDOI = wMainURL.split( "http://link.springer.com/" )[1];
					finalResults.push({
						title: wTitle ,
						doi: wDOI ,
						doiB64: EncodeB64( wDOI ) ,
						mainURL: wMainURL ,
						scihubURL: SCI_HUB_BASE_URL + wDOI
					});
				}

			}

			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function GENERATE_NOW_URL() {
	var today = new Date();
	var wTY = today.getFullYear();
	return SPRINGER_SEARCH_URL_P1 + wTY + SPRINGER_SEARCH_URL_P2 + wTY + SPRINGER_SEARCH_URL_P3;
}

const R_SPRINGER_PLACEHOLDER = "SCANNERS.SPRINGER.PLACEHOLDER";
const R_SPRINGER_NEW_TRACKING = "SCANNERS.SPRINGER.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED_DOIS = "SCANNERS.GLOBAL.ALREADY_TRACKED.DOIS";
function SEARCH() {
	return new Promise( async function( resolve , reject ) {
		try {

			console.log( "\nSpringer.com Scan Started" );
			console.log( "" );
			PrintNowTime();			

			// 1. ) Fetch Latest Results
			var wURL = GENERATE_NOW_URL();
			var wResults = await fetchXML( wURL );
			wResults = await PARSE_XML_RESULTS( wResults );

			// 2.) Compare to Already 'Tracked' DOIs and Store Uneq
			var b64_DOIS = wResults.map( x => x[ "doiB64" ] );
			await RU.setSetFromArray( redis , R_SPRINGER_PLACEHOLDER , b64_DOIS );
			await RU.setDifferenceStore( redis , R_SPRINGER_NEW_TRACKING , R_SPRINGER_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED_DOIS );
			await RU.delKey( redis , R_SPRINGER_PLACEHOLDER );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED_DOIS , b64_DOIS );

			const wNewTracking = await RU.getFullSet( redis , R_SPRINGER_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			wResults = wResults.filter( x => wNewTracking.indexOf( x[ "doiB64" ] ) !== -1 );
			await RU.delKey( redis , R_SPRINGER_NEW_TRACKING );
			
			// 3.) Tweet Results
			await TweetResults( wResults );

			console.log( "\nSpringer.com Scan Finished" );
			console.log( "" );
			PrintNowTime();

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SEARCH;