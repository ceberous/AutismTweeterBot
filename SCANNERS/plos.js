const request = require( "request" );
const cheerio = require( "cheerio" );
const { map } = require( "p-iteration" );

const TweetResults = require( "../UTILS/tweetManager.js" ).formatPapersAndTweet;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

function wSleep( ms ) { return new Promise( resolve => setTimeout( resolve , ms ) ); }

const DX_DOI_BASE_URL = "http://dx.doi.org";
const SCI_HUB_BASE_URL = DX_DOI_BASE_URL + ".sci-hub.tw/";

// http://collections.plos.org/lockss-manifest
const JOURNAL_NAMES = [ "plosbiology" , "plosclinicaltrials" , "ploscompbiol" , "plosgenetics" , "plosmedicine" , "plosntds" , "plosone" , "plospathogens" ];
const JN_BATCH_1 = [ "plosbiology" , "plosclinicaltrials" , "ploscompbiol" ];
const JN_BATCH_2 = [ "plosgenetics" , "plosmedicine" , "plosntds" , "plospathogens" ];
const JN_BATCH_3 = [ "plosone" ];
const MONTH_NAMES = [ "January" , "Febuary" , "March" , "April" , "May" , "June" , "July" , "August" , "September" , "October" , "November" , "December" ];
const BASE_URL_P = "http://journals.plos.org";
const BASE_URL_P1 = "http://journals.plos.org/";
const BASE_URL_P2 = "/lockss-manifest/vol_";
const BASE_URL_P3 = "?cursor=*&pageNumber=0";

const wSearchTerms = ["autism"];
function scanText( wText ) {
	for ( var i = 0; i < wSearchTerms.length; ++i ) {
		var wSTResult = wText.indexOf( wSearchTerms[ i ] );
		if ( wSTResult !== -1 ) {
			return true;
		}
	}	
	return false;
}

function GENERATE_NOW_TIME_URLS( wJournals ) {
	var today1 = new Date();
	var wTY1 = today1.getFullYear();
	var wTM1 = today1.getMonth();
	return wJournals.map( x => {
		return BASE_URL_P1 + x + BASE_URL_P2 + wTY1 + "/" + MONTH_NAMES[ wTM1 ] + BASE_URL_P3;
	});
}

function MAKE_REQUEST( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {

			var finalBody = null;
			function _m_request() {
				return new Promise( function( resolve , reject ) {
					try {
						request( wURL , async function ( err , response , body ) {
							if ( err ) { resolve("error"); return; }
							console.log( wURL + "\n\t--> RESPONSE_CODE = " + response.statusCode.toString() );
							if ( response.statusCode !== 200 ) {
								console.log( "bad status code ... " );
								resolve( "error" );
								return;
							}
							else {
								finalBody = body;
								resolve();
								return;
							}
						});
					}
					catch( error ) { console.log( error ); reject( error ); }
				});
			}

			var wRetry_Count = 3;
			var wSuccess = false;
			while( !wSuccess ) {
				if ( wRetry_Count < 0 ) { wSuccess = true; }
				var xSuccess = await _m_request();
				if ( xSuccess !== "error" ) { wSuccess = true; }
				else {
					wRetry_Count = wRetry_Count - 1;
					await wSleep( 2000 );
					console.log( "retrying" );
				}
			}
			resolve( finalBody );

		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}


function SEARCH_INDIVIDUAL_PLOS_ARTICLE( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {
			var wBody = await MAKE_REQUEST( wURL );
			try { var $ = cheerio.load( wBody ); }
			catch(err) { reject( "cheerio load failed" ); return; }

			var wTitle = $( "#artTitle" ).text();
			var wTitle_Found = false;
			if ( wTitle ) { 
				wTitle = wTitle.trim();
				wTitle_Found = scanText( wTitle );
			}
			var wAbstract_Found = false;
			var wAbstract_Text = $( ".abstract.toc-section" );
			wAbstract_Text = $( wAbstract_Text[0] ).text();
			if ( wAbstract_Text ) {
				wAbstract_Text = wAbstract_Text.trim();
				wAbstract_Found = scanText( wAbstract_Text );
			}
			if ( wTitle_Found || wAbstract_Found ) {
				console.log( wTitle );
				console.log( wAbstract_Text );
				resolve( wTitle );
				return;
			}
			else { resolve(); }
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function GET_MONTHS_RESULTS( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {

			var wMonthsResults = await MAKE_REQUEST( wURL );
			try { var $ = cheerio.load( wMonthsResults ); }
			catch(err) { reject( "cheerio load failed" ); return; }

			var finalResults = [];
			$( "li" ).each( function() {
				var wA_Tag = $( this ).children()[0];
				var wDOI = $( wA_Tag ).text();
				if ( wDOI ) { wDOI = wDOI.trim(); }
				var wLink = $( wA_Tag ).attr( "href" );
				finalResults.push({
					doi: wDOI ,
					link: BASE_URL_P + wLink
				});
			});

			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}


const R_PLOS_PLACEHOLDER = "SCANNERS.PLOS.PLACEHOLDER";
const R_PLOS_NEW_TRACKING = "SCANNERS.PLOS.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED_DOIS = "SCANNERS.GLOBAL.ALREADY_TRACKED.DOIS";
function SEARCH( wJournals ) {
	return new Promise( async function( resolve , reject ) {
		try {
			console.log( "" );
			console.log( "PLOS.org Scan Started" );
			PrintNowTime();	
			
			// 1.) Get This Month's Raw Results
			wJournals = wJournals || JOURNAL_NAMES;
			var wURLS = GENERATE_NOW_TIME_URLS( wJournals );
			console.log( wURLS );
			var wResults = await map( wURLS , wURL => GET_MONTHS_RESULTS( wURL ) );
			wResults = [].concat.apply( [] , wResults );
			//console.log( wResults );

			// 2.) Enumerate Results , searching for "autism"
			var wLinks = wResults.map( x => x["link"] );
			console.log("");
			console.log( "\nSearching --> " + wLinks.length.toString() + " Articles" );
			var wDetails = await map( wLinks , wLink => SEARCH_INDIVIDUAL_PLOS_ARTICLE( wLink ) );
			var wFinal_Found_Results = [];
			for ( var i = 0; i < wResults.length; ++i ) {
				if ( wDetails[ i ] !== undefined ) {
					wFinal_Found_Results.push({
						title: wDetails[ i ] ,
						doi: wResults[ i ][ "doi" ] ,
						doiB64: EncodeB64( wResults[ i ][ "doi" ] ) ,
						mainURL: wResults[ i ][ "link" ] ,
						scihubURL: SCI_HUB_BASE_URL + wResults[ i ][ "doi" ]
					});
				}
			}
			//console.log( wFinal_Found_Results );

			// 3.) Compare to Already 'Tracked' DOIs and Store Uneq
			var b64_DOIS = wFinal_Found_Results.map( x => x[ "doiB64" ] );
			await RU.setSetFromArray( redis , R_PLOS_PLACEHOLDER , b64_DOIS );
			await RU.setDifferenceStore( redis , R_PLOS_NEW_TRACKING , R_PLOS_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED_DOIS );
			await RU.delKey( redis , R_PLOS_PLACEHOLDER );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED_DOIS , b64_DOIS );

			const wNewTracking = await RU.getFullSet( redis , R_PLOS_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			wFinal_Found_Results = wFinal_Found_Results.filter( x => wNewTracking.indexOf( x[ "doiB64" ] ) !== -1 );
			await RU.delKey( redis , R_PLOS_NEW_TRACKING );

			// 4.) Tweet Results
			await TweetResults( wFinal_Found_Results );

			console.log( "" );
			console.log( "PLOS.org Scan Finished" );
			PrintNowTime();			
			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SEARCH;


function SLOW_SEARCH( wOptions ) {
	return new Promise( async function( resolve , reject ) {
		try {
			
			await SEARCH( JN_BATCH_1 );
			console.log( "done with batch 1" );
			await wSleep( 5000 );
			await SEARCH( JN_BATCH_2 );
			console.log( "done with batch 2" );
			await wSleep( 5000 );
			await SEARCH( JN_BATCH_3 );
			console.log( "done with batch 3" );

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SLOW_SEARCH;