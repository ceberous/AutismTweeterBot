var path = require("path");
var jsonfile = require("jsonfile");
var request = require( "request" );
var FeedParser = require("feedparser");

var subredditSave_FP = path.join( __dirname , "subredditResults.json" );
var SUBREDDIT_RESULTS = { "i": [] };
function WRITE_SUBREDDIT() { jsonfile.writeFileSync( subredditSave_FP , SUBREDDIT_RESULTS ); console.log( "SUBREDDIT SAVE FILE UPDATED" ); }
try { SUBREDDIT_RESULTS = jsonfile.readFileSync( subredditSave_FP ); }
catch ( err ) { WRITE_SUBREDDIT(); }
if ( !SUBREDDIT_RESULTS[ "i" ] ) { SUBREDDIT_RESULTS[ "i" ] = []; }

function fetchXML( wURL ) {
	return new Promise( async function( resolve , reject ) {
		try {
			//console.log( "Searching --> " + wURL );
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

function compareSeachResultsToCache( wResults ) {

	function flatten(array) {
	  return array.reduce(function(memo, el) {
	    var items = Array.isArray(el) ? flatten(el) : [el];
	    return memo.concat(items);
	  }, [] );
	}

	function uniq(a) { return Array.from( new Set( a ) ); }

	wResults = flatten( wResults );
	wResults = uniq( wResults );

	console.log( "Flattened Results = " );
	console.log( wResults );
	var xUniqueResults = [];
	for( var i = 0; i < wResults.length; ++i ) {
		var wUnique = true;
		for ( var j = 0; j < SUBREDDIT_RESULTS[ "i" ].length; ++j ) {
			if ( wResults[ i ] === SUBREDDIT_RESULTS[ "i" ][ j ] ) { wUnique = false; }
		}
		if ( wUnique ) { xUniqueResults.push( wResults[ i ] ); SUBREDDIT_RESULTS[ "i" ].push( wResults[ i ] ); }
	}

	WRITE_SUBREDDIT();
	return xUniqueResults; 
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
					if ( wtemp.length === 10 ) {
						//console.log( "KEYWORD MATCH GAURENTEED FOUND !!!!" );
						//console.log( xComments[i].link )
						wMatchedKeywordLinks.push( xComments[i].link );
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
			xCommentsThreads.shift();
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
				if ( wFoundInTitle ) { wResults.push( wLink ); }

				var wTopLayerComments 	= await fetchXML( wLink + ".rss" );
				var wChildComments 		= await enumerateCommentThreads( wTopLayerComments );
				if ( wChildComments.length > 0 ) { wResults.push( wChildComments ); }

			}
			resolve( wResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

function wSearchSubreddit( wSubreddit , wSection , wTerms ) {

	if ( SUBREDDIT_RESULTS[ "i" ].length > 200 ) { SUBREDDIT_RESULTS[ "i" ] = SUBREDDIT_RESULTS[ "i" ].slice( 99 , SUBREDDIT_RESULTS[ "i" ].length ); console.log( "PRUNED SUBREDDIT SAVE FILE" ); WRITE_SUBREDDIT(); }

	let wURL = "https://www.reddit.com/r/" + wSubreddit + "/" + wSection + "/.rss";
	wSearchTerms = wTerms;
	return new Promise( async function( resolve , reject ) {
		try {
			var wTopThreads 		= await fetchXML( wURL );
			var wSearchResults 		= await enumerateTopLevelThreads( wTopThreads );
			var wUniqueResults		= await compareSeachResultsToCache( wSearchResults );
			resolve( wUniqueResults );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}

module.exports.searchSubreddit = wSearchSubreddit;
