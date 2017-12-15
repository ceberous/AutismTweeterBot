


const WILEY_SEARCH_URL_P1 = "";


function SEARCH( wOptions ) {
	return new Promise( function( resolve , reject ) {
		try {
			resolve();
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.search = SEARCH;