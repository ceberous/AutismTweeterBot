module.exports.printNowTime = function() {

	var today = new Date();
	var wTY = today.getFullYear();
	var wTM = ( today.getMonth() + 1 );
	var wTD = today.getDate();
	var wTH = today.getHours();
	var wTM = today.getMinutes();
	console.log(  wTY + "-" + wTM + "-" + wTD + " === " + wTH + ":" + wTM + "\n" );

};

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