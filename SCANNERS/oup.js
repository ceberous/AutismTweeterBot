const cheerio = require( "cheerio" );
const puppeteer = require( "puppeteer" );

const TweetResults = require( "../UTILS/tweetManager.js" ).formatPapersAndTweet;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

const DX_DOI_BASE_URL = "http://dx.doi.org";
const SCI_HUB_BASE_URL = DX_DOI_BASE_URL + ".sci-hub.tw/";


const OUP_SEARCH_URL_P1 = "https://academic.oup.com/journals/search-results?f_ContentType=Journal+Article&fl_ArticleTitleExact=autism&fl_SiteID=5567&qb=%7b%22ArticleTitle1%22%3a%22autism%22%2c%22ArticleAbstract2%22%3a%22autism%22%7d&sort=Date+%e2%80%93+Newest+First&rg_ArticleDate=";
const OUP_SEARCH_URL_P2 = "%20TO%20";

function genTodaySearchURL(){

	var today = new Date();
	var wTY = today.getFullYear();
	var wTM = ( today.getMonth() + 1 );
	var wTD = today.getDate();
	var todayDateString = wTM + "/" + wTD + "/" + wTY;

	var previous = new Date( new Date().setDate( new Date().getDate() - 30 ) );
	var wPY = previous.getFullYear();
	var wPM = ( previous.getMonth() + 1 );
	var wPD = previous.getDate();
	var previousDateString = wPM + "/" + wPD + "/" + wPY;
	
	return OUP_SEARCH_URL_P1 + previousDateString + OUP_SEARCH_URL_P2 + todayDateString;
}


function PARSE_RESULT_PAGE( wBody ) {
	return new Promise( function( resolve , reject ) {
		try {

			try { var $ = cheerio.load( wBody ); }
			catch(err) { reject( "cheerio load failed" ); return; }

			var finalResults = [];
			$( ".al-article-box" ).each( function() {
				
				var wTitle = $( this ).children( ".customLink" );
				wTitle = $( wTitle ).children( "a" );
				wTitle = $( wTitle[0] ).text();
				if ( wTitle ) { wTitle = wTitle.trim(); }

				var wMainURL = $( this ).children( ".al-citation-list" ).children( "span" ).children( "a" );
				wMainURL = $( wMainURL[0] ).attr( "href" );

				var wDOI = wMainURL.split( "https://doi.org/" )[1];

				finalResults.push({
					doi: wDOI ,
					doiB64: EncodeB64( wDOI ) ,
					title: wTitle ,
					mainURL:  wMainURL ,
					scihubURL: SCI_HUB_BASE_URL + wDOI					
				});

			});

			resolve( finalResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const R_OUP_PLACEHOLDER = "SCANNERS.OUP.PLACEHOLDER";
const R_OUP_NEW_TRACKING = "SCANNERS.OUP.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED_DOIS = "SCANNERS.GLOBAL.ALREADY_TRACKED.DOIS";
function SEARCH() {
	return new Promise( async function( resolve , reject ) {
		try {

			console.log( "\nAcademic.OUP.com Scan Started" );
			console.log( "" );
			PrintNowTime();			

			// 1. ) Fetch Latest Results
			var wURL = genTodaySearchURL();
			console.log( wURL );
			const browser = await puppeteer.launch();
			const page = await browser.newPage();
			await page.goto( wURL , { waitUntil: "networkidle2" });
			var wResults = await page.content();
			await browser.close();
			var finalResults = await PARSE_RESULT_PAGE( wResults );
			console.log( finalResults );

			// 2.) Compare to Already 'Tracked' DOIs and Store Uneq
			var b64_DOIS = finalResults.map( x => x[ "doiB64" ] );
			await RU.setSetFromArray( redis , R_OUP_PLACEHOLDER , b64_DOIS );
			await RU.setDifferenceStore( redis , R_OUP_NEW_TRACKING , R_OUP_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED_DOIS );
			await RU.delKey( redis , R_OUP_PLACEHOLDER );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED_DOIS , b64_DOIS );

			const wNewTracking = await RU.getFullSet( redis , R_OUP_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "nothing new found" ); PrintNowTime(); resolve(); return; }
			finalResults = finalResults.filter( x => wNewTracking.indexOf( x[ "doiB64" ] ) !== -1 );
			await RU.delKey( redis , R_OUP_NEW_TRACKING );
			
			// 3.) Tweet Results
			await TweetResults( finalResults );

			console.log( "\nAcademic.OUP.com Scan Finished" );
			console.log( "" );
			PrintNowTime();

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SEARCH;