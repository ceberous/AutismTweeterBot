const request = require( "request" );
const cheerio = require( "cheerio" );
const { map } = require( "p-iteration" );

const TweetResults = require( "../UTILS/tweetManager.js" ).formatPapersAndTweet;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const MakeRequest = require( "../UTILS/genericUtils.js" ).makeRequest;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

const DX_DOI_BASE_URL = "http://dx.doi.org";
const SCI_HUB_BASE_URL = DX_DOI_BASE_URL + ".sci-hub.tw/";

const WILEY_SEARCH_URL_BASE = "http://onlinelibrary.wiley.com/advanced/search/results/reentry?scope=allContent&dateRange=inTheLast&inTheLastList=1&startYear=&endYear=&queryStringEntered=false&searchRowCriteria[0].queryString=autism&searchRowCriteria[0].fieldName=publication-title&searchRowCriteria[0].booleanConnector=or&searchRowCriteria[1].queryString=autism&searchRowCriteria[1].fieldName=document-title&searchRowCriteria[1].booleanConnector=or&searchRowCriteria[2].queryString=autism&searchRowCriteria[2].fieldName=abstract&searchRowCriteria[2].booleanConnector=and&publicationFacet=journal&ordering=date&resultsPerPage=20";

const WILEY_SEARCH_URL_SECONDARY = WILEY_SEARCH_URL_BASE + "&start=";


function CUSTOM_RESULT_PAGE_PARSER( wBody ) {
	return new Promise( function( resolve , reject ) {
		try {
			var finalResults = [];
			try { var $ = cheerio.load( wBody ); }
			catch(err) { reject( "cheerio load failed" ); return; }

			// 2. ) Gather Results from Main-Page
			$( ".citation.article" ).each( function() {
				var wA_TAG = $( this ).children("a");
				var wDOI = $( wA_TAG ).attr( "href" );
				wDOI = wDOI.split( "/doi/" )[1];
				wDOI = wDOI.split( "/full" )[0];
				var wTitle = $( wA_TAG ).text();
				if ( wTitle ) { wTitle = wTitle.trim(); }
				finalResults.push({
					title: wTitle ,
					doi: wDOI ,
					doiB64: EncodeB64( wDOI ) ,
					mainURL: DX_DOI_BASE_URL + "/" + wDOI ,
					scihubURL: SCI_HUB_BASE_URL + wDOI ,
				});
			});
			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function FETCH_AND_PARSE_SINGLE_RESULT_PAGE( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {
			var wPageBody = await MakeRequest( wURL );
			var finalResults = await CUSTOM_RESULT_PAGE_PARSER( wPageBody );
			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function CUSTOM_SEARCHER() {
	return new Promise( async function( resolve , reject ) {
		try {

			// 1.) Search Base Search URL 
			var wMainPageBody = await MakeRequest( WILEY_SEARCH_URL_BASE );
			
			// 2.) Parse Initial Main-Page
			var finalResults = await CUSTOM_RESULT_PAGE_PARSER( wMainPageBody );

			// 3.) Based on Number of Results , build remaining search URLS
			// ***limited by them to 20 per page***
			try { var $ = cheerio.load( wMainPageBody ); }
			catch(err) { reject( "cheerio load failed" ); return; }			
			var wTotalResults = $( "#searchedForText" ).children("em");
			wTotalResults = $( wTotalResults[0] ).text();
			wTotalResults = parseInt( wTotalResults );
			console.log( "\nTotal Search Results = " + wTotalResults.toString() + "\n" );
			var wRemainingSearchURLS = [];
			var wStartIndex = 21;
			while ( wStartIndex < wTotalResults ) {
				var wURL = WILEY_SEARCH_URL_SECONDARY + wStartIndex.toString();
				wRemainingSearchURLS.push( wURL );
				wStartIndex = wStartIndex + 20;
			}

			// 4. ) Search Secondary Pages
			var wSecondaryPageResults = await map( wRemainingSearchURLS , wURL => FETCH_AND_PARSE_SINGLE_RESULT_PAGE( wURL ) );
			finalResults = [].concat.apply( [] , wSecondaryPageResults );

			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const R_WILEY_PLACEHOLDER = "SCANNERS.WILEY.PLACEHOLDER";
const R_WILEY_NEW_TRACKING = "SCANNERS.WILEY.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED_DOIS = "SCANNERS.GLOBAL.ALREADY_TRACKED.DOIS";
function SEARCH( wOptions ) {
	return new Promise( async function( resolve , reject ) {
		try {

			console.log( "" );
			console.log( "\nWiley.com Scan Started" );
			PrintNowTime();

			// 1.) Gather Main-Page Results
			var finalResults = await CUSTOM_SEARCHER();

			// 2.) Compare and Store 'Uneq' Results
			var b64_DOIS = finalResults.map( x => x[ "doiB64" ] );
			await RU.setSetFromArray( redis , R_WILEY_PLACEHOLDER , b64_DOIS );
			await RU.setDifferenceStore( redis , R_WILEY_NEW_TRACKING , R_WILEY_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED_DOIS );
			await RU.delKey( redis , R_WILEY_PLACEHOLDER );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED_DOIS , b64_DOIS );

			const wNewTracking = await RU.getFullSet( redis , R_WILEY_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			finalResults = finalResults.filter( x => wNewTracking.indexOf( x[ "doiB64" ] ) !== -1 );
			await RU.delKey( redis , R_WILEY_NEW_TRACKING );

			// 3.) Tweet Uneq Results
			await TweetResults( finalResults );
			
			console.log( "" );
			console.log( "\nWiley.com Scan Finished" );
			PrintNowTime();

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SEARCH;