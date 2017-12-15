module.exports.search = function ( wOptions ) {
	return new Promise( function( resolve , reject ) {
		try {
			if ( wOptions ) {
				console.log( "wOptions" );
			}
			else {
				console.log( "no options" );
			}
			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
};