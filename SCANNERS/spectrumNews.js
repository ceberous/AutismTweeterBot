const request = require( "request" );
const FeedParser = require( "feedparser" );

const TweetResults = require( "../UTILS/tweetManager.js" ).enumerateTweets;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

const SPECTRUM_NEWS_BASE_URL = "https://spectrumnews.org/feed/";

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
					finalResults.push({
						title: wTitle ,
						doiB64: EncodeB64( wTitle ) ,
						mainURL: wResults[ i ][ "link" ]
					});
				}
			}

			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const R_SPECTRUM_PLACEHOLDER = "SCANNERS.SPECTRUM.PLACEHOLDER";
const R_SPECTRUM_NEW_TRACKING = "SCANNERS.SPECTRUM.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED_DOIS = "SCANNERS.GLOBAL.ALREADY_TRACKED.DOIS";
function SEARCH() {
	return new Promise( async function( resolve , reject ) {
		try {

			console.log( "\nSpectrumNews.org Scan Started" );
			console.log( "" );
			PrintNowTime();			

			// 1. ) Fetch Latest Results
			var wResults = await fetchXML( SPECTRUM_NEWS_BASE_URL );
			wResults = await PARSE_XML_RESULTS( wResults );

			// 2.) Compare to Already 'Tracked' DOIs and Store Uneq
			var b64_DOIS = wResults.map( x => x[ "doiB64" ] );
			await RU.setSetFromArray( redis , R_SPECTRUM_PLACEHOLDER , b64_DOIS );
			await RU.setDifferenceStore( redis , R_SPECTRUM_NEW_TRACKING , R_SPECTRUM_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED_DOIS );
			await RU.delKey( redis , R_SPECTRUM_PLACEHOLDER );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED_DOIS , b64_DOIS );

			const wNewTracking = await RU.getFullSet( redis , R_SPECTRUM_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			wResults = wResults.filter( x => wNewTracking.indexOf( x[ "doiB64" ] ) !== -1 );
			await RU.delKey( redis , R_SPECTRUM_NEW_TRACKING );
			
			// 3.) Tweet Results
			var wFormattedTweets = [];
			for ( var i = 0; i < wResults.length; ++i ) {
				var wMessage = "#AutismResearch ";
				if ( wResults[i].title.length > 100 ) {
					wMessage = wMessage + wResults[i].title.substring( 0 , 97 );
					wMessage = wMessage + "...";
				}
				else {
					wMessage = wMessage + wResults[i].title.substring( 0 , 100 );
				}
				if ( wResults[i].mainURL ) {
					wMessage = wMessage + " " + wResults[i].mainURL;
				}
				wFormattedTweets.push( wMessage );
			}
			console.log( wFormattedTweets );
			await TweetResults( wFormattedTweets );

			console.log( "\nSpectrumNews.org Scan Finished" );
			console.log( "" );
			PrintNowTime();

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SEARCH;