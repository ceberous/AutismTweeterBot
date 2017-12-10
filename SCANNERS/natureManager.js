const request = require( "request" );
const FeedParser = require("feedparser");
const puppeteer = require('puppeteer');
const cheerio = require( "cheerio" );
const { map } = require( "p-iteration" );

//const TweetResults = require( "../UTILS/tweetManager.js" ).enumerateTweets;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

// jesus fucking christ
// why does every other fucking person have to have their own bull shit
// god fucking damn it make it json for fucks sake
// what the fuck is this ?? http://rimmartin.github.io/saxon-node/tut/performatransform.html
// https://github.com/Leonidas-from-XIV/node-xml2js
// https://www.npmjs.com/package/htmlparser
// http://toolbox.no.de/packages/node_xslt
// https://stackoverflow.com/questions/6240577/node-js-library-implementing-w3c-xml-dom
// https://github.com/jindw/xmldom
// https://github.com/lapwinglabs/x-ray-phantom
// https://github.com/lindory-project/node-xml-splitter
// https://github.com/casperjs/casperjs
// https://github.com/assaf/zombie
// https://github.com/nwjs/nw.js

// https://github.com/GoogleChrome/puppeteer
// https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#

const wFeedURL = "https://www.nature.com/opensearch/request?interface=sru&query=dc.description+%3D+%22autism%22+OR+dc.subject+%3D+%22autism%22+OR+dc.title+%3D+%22autism%22+AND+prism.publicationDate+%3E+%222017-11-01%22&httpAccept=application%2Fsru%2Bxml&maximumRecords=100&startRecord=1&recordPacking=packed&sortKeys=publicationDate%2Cpam%2C0";

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
					});
				}			
			}

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function FETCH_PUPPETEER(){
	return new Promise( async function( resolve , reject ) {
		try {
			const browser = await puppeteer.launch();
			const page = await browser.newPage();
			await page.goto( wFeedURL , { waitUntil: 'networkidle2' });
			//await page.pdf( { path: 'hn.pdf' , format: 'A4' } );
			wResults = await page.content();
			await browser.close();
			await PARSE_PUPPETEER();
			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function SEARCH_TODAY() {
	return new Promise( async function( resolve , reject ) {
		try {
			await FETCH_PUPPETEER();
			console.log( wFinalResults );
			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.searchToday = SEARCH_TODAY;