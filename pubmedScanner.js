var path = require("path");
var jsonfile = require("jsonfile");
var request = require( "request" );
var cheerio = require('cheerio');

var pubMedSave_FP = path.join( __dirname , "pubmedResults.json" );
var PUB_MED_RESULTS = {};
function WRITE_PUB_MED() { jsonfile.writeFileSync( pubMedSave_FP , PUB_MED_RESULTS ); }
try { PUB_MED_RESULTS = jsonfile.readFileSync( pubMedSave_FP ); }
catch ( err ) { WRITE_PUB_MED(); }

function getPubMedIDInfo( wPubMedID ) {
	var wURL = "https://api.altmetric.com/v1/pmid/" + wPubMedID;
	return new Promise( function( resolve , reject ) {
		var wResults = [];
		try {
			request( wURL , function ( err , response , body ) {
				console.log( "\n" + wURL + " --> RESPONSE_CODE = " + response.statusCode.toString() );
				if ( response.statusCode !== 200 ) {
					var wURL2 = "https://www.ncbi.nlm.nih.gov/pubmed/" + wPubMedID;
					console.log( "\t --> Cherrio.js --> " + wURL2 );
					request( wURL2 , function( wErr , wResponse , wBody ){

				        var $ = cheerio.load( wBody );
				        var wOBJ1 = null;
				        $('a').each( function () {
				        	var wID = $(this).attr('href');
				        	var wDOI = wID.substring( 0 , 10 );
				        	if ( wDOI === "//doi.org/" ) {
				        		var x1 = $('.rprt.abstract').children();
				        		var x2 = $( x1[2] ).text();
							if ( !x2 || x2 === null || x2.length < 1 ) { x2 = " "; }
								//console.log( "DEBUGGING @ pubMedQuery.js +56 = x2 = " + x2 );
				        		wDOI = wID.substring( 10 , wID.length );
					        	wOBJ1 = {
									title: x2,
									pmid: wPubMedID,
									doi: wDOI,
									pubmedURL: "https://www.ncbi.nlm.nih.gov/pubmed/" + wPubMedID,
									scihubURL: "http://dx.doi.org.sci-hub.bz/" + wDOI
					        	};
					        	//console.log( wOBJ1 );
				        	}
				        });

				        resolve( wOBJ1 );

					});
				}
				else { body = JSON.parse( body ); resolve( body ); }
			});
		}
		catch( err ) { console.log(err); reject( err ); }
	});
}

function searchPubMedPreviousDay( wSearchTerms ) {

	var today = new Date();
	var wTY = today.getFullYear();
	var wTM = ( today.getMonth() + 1 );
	var wTD = today.getDate();
	var yesterday = new Date( Date.now() - 86400000 );
	var wYY = yesterday.getFullYear();
	var wYM = ( yesterday.getMonth() + 1 );
	var wYD = yesterday.getDate();

	var wURL = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=%28%28%28";
	const wFinal = wSearchTerms.length - 1;
	for ( var i = 0; i < wSearchTerms.length; ++i ) {
		wURL = wURL + wSearchTerms[ i ] + "%5BTitle%5D%29+AND+%28%22";
		wURL = wURL + wYY + "%2F" + wYM + "%2F" + wYD + "%22%5BDate+-+Publication%5D+%3A+%22";
		wURL = wURL + wTY + "%2F" + wTM + "%2F" + wTD + "%22%5BDate+-+Publication%5D%29%29";
		if ( i !== wFinal ) { wURL = wURL + "+OR+"; }
	}
	wURL = wURL + "&retmode=json&retmax=1000";

	console.log( "\n" + wURL + "\n" );

	return new Promise( function( resolve , reject ) {
		var wResults = [];
		try {
			request( wURL , function ( err , response , body ) {
				if ( response.statusCode !== 200 ) { reject(err); }
				body = JSON.parse( body ); 
				resolve( body );
			});
		}
		catch( err ) { console.log(err); reject(err); }
	});

}

function enumeratePubIDS( wPubMedIDS ) {
	console.log( wPubMedIDS );
	var wResults = [];
	return new Promise( async function( resolve , reject ) {
		try{
			for( var i = 0; i < wPubMedIDS.length; ++i ) {
				
				var pubIDInfo = await getPubMedIDInfo( wPubMedIDS[ i ] );

				if ( pubIDInfo === "NotFound" ) { continue; }
				if ( pubIDInfo instanceof Object !== true ) { continue; }
				wResults.push({
					title: pubIDInfo[ "title" ] || "",
					pmid: wPubMedIDS[ i ] || "",
					doi: pubIDInfo[ "doi" ] || "",
					pubmedURL: "https://www.ncbi.nlm.nih.gov/pubmed/" + wPubMedIDS[ i ] || "",
					scihubURL: "http://dx.doi.org.sci-hub.bz/" + pubIDInfo[ "doi" ] || ""
				});
				//console.log( wResults[ wResults.length - 1 ] );
				
				if ( i === ( wPubMedIDS.length - 1 ) ) { resolve( wResults ); }
			}
		}
		catch( err ) { console.log(err); reject( err ); }
	});
}

function getUnsentItems( wResults ) {
	
	console.log("");
	var today = new Date();
	var wTD = today.getDate();
	wTD = wTD.toString();

	var wNeedToTweet = [];
	wResults.forEach( function( wITEM ) {
		var unique = true;
		for( wDay in PUB_MED_RESULTS ) {
			if ( PUB_MED_RESULTS[ wDay ].length === 0 ) { continue; }
			for ( var i = 0; i < PUB_MED_RESULTS[ wDay ].length; ++i ) {
				if ( PUB_MED_RESULTS[ wDay ][ i ].pmid === wITEM[ "pmid" ] ) { 
					console.log( "Already Tweeted PMID: --> " + PUB_MED_RESULTS[ wDay ][ i ].pmid ); 
					unique = false; 
					return; 
				}
			}
			if ( unique === false ) { return; }
		}
		if ( unique ) { wNeedToTweet.push( wITEM ); }
	});

	var wFormattedTweets = [];
	for ( var i = 0; i < wNeedToTweet.length; ++i ) {
		var wMessage = wResults[i].title.substring( 0 , 80 );
		wMessage = wMessage + " " + wResults[i].pubmedURL;
		wMessage = wMessage + " Paper: " + wResults[i].scihubURL;
		wFormattedTweets.push( wMessage );
	}

	PUB_MED_RESULTS[ wTD ] = wResults;
	WRITE_PUB_MED();
	return wFormattedTweets;

}

function wSearchPublishedTodayTitle( wTerms ) {
	return new Promise( async function( resolve , reject ) {
		try{
			var wPubMedSearchResults 	= await searchPubMedPreviousDay( wTerms );
			var wPubMedResultInfo 		= await enumeratePubIDS( wPubMedSearchResults[ "esearchresult" ][ "idlist" ] );
			var uniqueResults 			= getUnsentItems( wPubMedResultInfo );
			resolve( uniqueResults );
		}
		catch( err ) { console.log( err ); reject( err ); }
	});
}


module.exports.searchPublishedTodayTitle = wSearchPublishedTodayTitle;

