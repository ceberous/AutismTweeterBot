const request = require( "request" );
const FeedParser = require("feedparser");

const EncodeB64 = require( "../UTILS/genericUtils.js" ).encodeBase64;
const TweetResults = require( "../UTILS/tweetManager.js" ).enumerateTweets;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

function wSleep( ms ) { return new Promise( resolve => setTimeout( resolve , ms ) ); }
function flatten(array) {
  return array.reduce(function(memo, el) {
    var items = Array.isArray(el) ? flatten(el) : [el];
    return memo.concat(items);
  }, [] );
}
function uniq(a) { return Array.from( new Set( a ) ); }


function fetchXML( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {
			//console.log( "Searching --> " + wURL );
			//await wSleep( 300 );
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
				if ( res.statusCode !== 200) {
					console.log( "Bad status code" );
					console.log( res.statusCode );
					resolve("");
					return;
				}
				else { stream.pipe( feedparser ); }
			});

		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}


var wSearchTerms = [];
function scanText( wText ) {
	for ( var i = 0; i < wSearchTerms.length; ++i ) {
		wSTResult = wText.indexOf( wSearchTerms[ i ] );
		if ( wSTResult != -1 ) {
			return true;
		}
	}
	return false;
}

function enumerateSingleThread( xComments ) {
	return new Promise( function( resolve , reject ) {
		try {
			var wMatchedKeywordLinks = [];
			for( var i = 0; i < xComments.length; ++i ) {

				var x1 = xComments[i]["atom:content"]["#"].toLowerCase();

				var wFoundKeyword = scanText( x1 );
				if ( wFoundKeyword ) {			
					var wtemp = xComments[i].link.split("/");
					var wID = wtemp[ wtemp.length - 4 ] + "-" + wtemp[ wtemp.length - 2 ];
					if ( wtemp.length === 10 ) {
						//console.log( "KEYWORD MATCH GAURENTEED FOUND !!!!" );
						//console.log( xComments[i].link )
						wMatchedKeywordLinks.push({
							id: wID ,
							link: xComments[i].link
						});
					}
				}
			}
			resolve( wMatchedKeywordLinks );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}


function enumerateCommentThreads( xCommentsThreads ) {
	return new Promise( async function( resolve , reject ) {
		try {
			try{ xCommentsThreads.shift(); }
			catch( e ) { resolve([]); return; }
			let wCLen = xCommentsThreads.length;
			let wClenS = wCLen.toString();
			var wResults = [];
			for ( var i = 0; i < wCLen; ++i ) {
				var x1 = xCommentsThreads[ i ].link + ".rss";
				console.log( "\t\t" + x1 + " [ " + ( i + 1 ).toString() + " of " + wClenS + " ]" );
				var xComments 	= await fetchXML( x1 );
				var xResults 	= await enumerateSingleThread( xComments );
				if ( xResults.length > 0 ) { wResults.push( xResults ); }
			}
			resolve( wResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function enumerateTopLevelThreads( wThreads ) {
	return new Promise( async function( resolve , reject ) {
		try {
			let wTLen = wThreads.length;
			let wTLenS = wTLen.toString();
			var wResults = [];
			for ( var i = 0; i < wTLen; ++i ) {
				
				let wLink = wThreads[ i ].link;
				console.log( "\nSearching --> " + wThreads[ i ].link + ".rss" + " [ " + ( i + 1 ) + " of " + wTLenS + " ]" );
				console.log( wThreads[i]["atom:title"]["#"] + "\n" );
				
				var wFoundInTitle		= scanText( wThreads[i]["atom:title"]["#"].toLowerCase() );
				if ( wFoundInTitle ) {
					var wtemp = wLink.split("/");
					var wID = wtemp[ wtemp.length - 2 ];
					wID = EncodeB64( wID );
					wResults.push({
						id: wID ,
						link: wLink
					}); 
				}

				var wTopLayerComments 	= await fetchXML( wLink + ".rss" );
				var wChildComments 		= await enumerateCommentThreads( wTopLayerComments );
				if ( wChildComments.length > 0 ) { wResults.push( wChildComments ); }

			}
			wResults = flatten( wResults );
			wResults = uniq( wResults );
			resolve( wResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const R_SUBREDDIT_PLACEHOLDER = "SCANNERS.SUBREDDIT.PLACEHOLDER";
const R_PUBMED_NEW_TRACKING = "SCANNERS.SUBREDDIT.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED = "SCANNERS.SUBREDDIT.ALREADY_TRACKED";
function wSearchSubreddit( wSubreddit , wSection , wTerms ) {

	let wURL = "https://www.reddit.com/r/" + wSubreddit + "/" + wSection + "/.rss";
	wSearchTerms = wTerms;
	return new Promise( async function( resolve , reject ) {
		try {
			console.log( "\nStarted Subbreddit Scan" );
			PrintNowTime();

			// 1.) Search very slowly , because of reddit
			var wTopThreads 		= await fetchXML( wURL );
			var wSearchResults 		= await enumerateTopLevelThreads( wTopThreads );
			console.log( wSearchResults );

			// 2.) Filter and Store 'Uneq' into Redis
			var wIDS = wSearchResults.map( x => x["id"] );
			await RU.setSetFromArray( redis , R_SUBREDDIT_PLACEHOLDER , wIDS );
			await RU.setDifferenceStore( redis , R_PUBMED_NEW_TRACKING , R_SUBREDDIT_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED );
			await RU.delKey( redis , R_SUBREDDIT_PLACEHOLDER );
			const wNewTracking = await RU.getFullSet( redis , R_PUBMED_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "\nSubreddit-Scan --> nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "\nSubreddit-Scan --> nothing new found" ); PrintNowTime(); resolve(); return; }
			wIDS = wIDS.filter( x => wNewTracking.indexOf( x ) !== -1 );
			wSearchResults = wSearchResults.filter( x => wIDS.indexOf( x["id"] ) !== -1 );
			await RU.delKey( redis , R_PUBMED_NEW_TRACKING );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED , wIDS );

			// 3.) Tweet Unique Results
			wSearchResults =  wSearchResults.map( x => "#AutismComments " + x["link"] );
			//console.log( wSearchResults );
			await TweetResults( wSearchResults );

			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

module.exports.searchSubreddit = wSearchSubreddit;