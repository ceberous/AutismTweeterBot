const request = require( "request" );
const FeedParser = require( "feedparser" );
const { map } = require( "p-iteration" );
const TweetResults = require( "../UTILS/tweetManager.js" ).enumerateTweets;
const PrintNowTime = require( "../UTILS/genericUtils.js" ).printNowTime;
const redis = require( "../UTILS/redisManager.js" ).redis;
const RU = require( "../UTILS/redisUtils.js" );

var wSearchTerms = [];
var wFinalTweets = [];

function fetchXML( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {
			console.log( "Searching --> " + wURL );
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
				if ( res.statusCode !== 200) { reject( "Bad status code" ); }
				else { stream.pipe( feedparser ); }
			});

		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function scanText( wText ) {
	for ( var i = 0; i < wSearchTerms.length; ++i ) {
		wSTResult = wText.indexOf( wSearchTerms[ i ] );
		if ( wSTResult != -1 ) {
			return true;
		}
	}
	return false;
}

function SEARCH_SINGLE_THREAD( wComments ) {
	return new Promise( function( resolve , reject ) {
		try {
			var wFR = [];
			var x1 = wComments["atom:content"]["#"].toLowerCase();
			var wFoundKeyword = scanText( x1 );
			if ( wFoundKeyword ) {			
				var wtemp = wComments.link.split("/");
				if ( wtemp.length === 10 ) {
					//console.log( "KEYWORD MATCH GAURENTEED FOUND !!!!" );
					//console.log( wComments.link )
					var wID = wtemp[ wtemp.length - 4 ] + "-" + wtemp[ wtemp.length - 2 ];
					wFR.push({
						id: wID ,
						link: wComments.link
					});
				}
			}
			resolve( wFR );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

const R_SUBREDDIT_PLACEHOLDER = "SCANNERS.SUBREDDIT.PLACEHOLDER";
const R_PUBMED_NEW_TRACKING = "SCANNERS.SUBREDDIT.NEW_TRACKING";
const R_GLOBAL_ALREADY_TRACKED = "SCANNERS.SUBREDDIT.ALREADY_TRACKED";
function SEARCH_SUBREDDIT( wSubreddit , wSection , wTerms ) {
	return new Promise( async function( resolve , reject ) {
		try {

			console.log( "\nStarted Subbreddit Scan" );
			PrintNowTime();

			// 1.) Get 'Top' Level Threads
			wSearchTerms = wTerms;
			var wMainURL = "https://www.reddit.com/r/" + wSubreddit + "/" + wSection + "/.rss";
			var wTopThreads = await fetchXML( wMainURL );

			// 2.) Search the Each Title
			var wTopCommentTitles = wTopThreads.map( x => x["atom:title"]["#"].toLowerCase() );
			wTopCommentTitles = wTopCommentTitles.filter( x => scanText( x ) === true );
			wTopCommentTitles =  wTopCommentTitles.map( x => "#AutismComments " + x );
			wFinalTweets = [].concat.apply( [] , wTopCommentTitles );

			// 3.) Get 'Comment' Threads for each 'Top' Thread
			var wTopCommentURLS = wTopThreads.map( x => x["link"] + ".rss" );
			var wTopCommentsThreads = await map( wTopCommentURLS , wURL => fetchXML( wURL ) ); 
			wTopCommentsThreads = wTopCommentsThreads.map( x => x.shift() ); // 1st one is "main" url
			wTopCommentsThreads = [].concat.apply( [] , wTopCommentsThreads );

			// 4.) Get 'Single' Threads for each 'Comment' Thread
			var wSingleCommentURLS = wTopCommentsThreads.map( x => x["link"] + ".rss" );
			var wSingleThreads = await map( wSingleCommentURLS , wURL => fetchXML( wURL ) );
			wSingleThreads = [].concat.apply( [] , wSingleThreads );
			
			// 5.) Finally, Search over All Single Comments
			var wResults = await map( wSingleThreads , wThread => SEARCH_SINGLE_THREAD( wThread ) );
			wResults = [].concat.apply( [] , wResults );

			// 6.) Filter for 'Un-Tweeted' Results and Store 'Uneq' ones
			var wIDS = wResults.map( x => x["id"] );
			await RU.setSetFromArray( redis , R_SUBREDDIT_PLACEHOLDER , wIDS );
			await RU.setDifferenceStore( redis , R_PUBMED_NEW_TRACKING , R_SUBREDDIT_PLACEHOLDER , R_GLOBAL_ALREADY_TRACKED );
			await RU.delKey( redis , R_SUBREDDIT_PLACEHOLDER );
			const wNewTracking = await RU.getFullSet( redis , R_PUBMED_NEW_TRACKING );
			if ( !wNewTracking ) { console.log( "\nSubreddit-Scan --> nothing new found" ); PrintNowTime(); resolve(); return; }
			if ( wNewTracking.length < 1 ) { console.log( "\nSubreddit-Scan --> nothing new found" ); PrintNowTime(); resolve(); return; }
			wIDS = wIDS.filter( x => wNewTracking.indexOf( x ) !== -1 );
			wResults = wResults.filter( x => wIDS.indexOf( x["id"] ) !== -1 );
			await RU.delKey( redis , R_PUBMED_NEW_TRACKING );
			await RU.setSetFromArray( redis , R_GLOBAL_ALREADY_TRACKED , wIDS );

			// 7.) Tweet Unique Results
			wResults =  wResults.map( x => "#AutismComments " + x["link"] );
			wFinalTweets = [].concat.apply( [] , wResults );
			console.log( wFinalTweets );
			await TweetResults( wFinalTweets );

			wSearchTerms = [];
			wFinalTweets = [];
			console.log( "\nSubbreddit Scan Finished" );
			PrintNowTime();			
			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.searchSubreddit = SEARCH_SUBREDDIT;