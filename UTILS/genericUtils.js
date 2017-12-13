function W_SLEEP( ms ) { return new Promise( resolve => setTimeout( resolve , ms ) ); }
module.exports.wSleep = W_SLEEP;

function PRINT_NOW_TIME() {
	var today = new Date();
	var wTY = today.getFullYear();
	var wTM = ( today.getMonth() + 1 );
	var wTD = today.getDate();
	var wTH = today.getHours();
	var wTM = today.getMinutes();
	console.log(  wTY + "-" + wTM + "-" + wTD + " === " + wTH + ":" + wTM + "\n" );
}


module.exports.printNowTime = PRINT_NOW_TIME;

module.exports.encodeBase64 = function( wString ) {
	if ( !wString ) { return "error"; }
	var a1 = new Buffer( wString );
	return a1.toString( "base64" );
};

module.exports.decodeBase64 = function( wString ) {
	var a1 = "";
	try { a1 = new Buffer( wString , "base64" ); }
	catch( e ) { console.log( "error decoding base64" ); console.log( wString ); }
	return a1.toString();
};


const request = require( "request" );

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
					await W_SLEEP( 2000 );
					console.log( "retrying" );
				}
			}
			resolve( finalBody );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.makeRequest = MAKE_REQUEST;