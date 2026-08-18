// Peek, service worker. Держит токен и ходит в API ВК пачками через execute.
// Из контент-скрипта напрямую не ходим: там CSP страницы.

const FALLBACK_HOST = 'api.vk.com'
const FALLBACK_VERSION = '5.131'

let auth = { token: '', host: '', v: '' }

chrome.storage.session.get( { auth: null } )
	.then( saved => { if ( saved && saved.auth ) auth = saved.auth } )
	.catch( () => {} )

chrome.runtime.onMessage.addListener( ( msg, sender, reply ) => {

	if ( !msg || typeof msg.type !== 'string' ) return

	if ( msg.type === 'peek_auth' ) {
		if ( msg.token && msg.token !== auth.token ) {
			auth = { token: msg.token, host: msg.host || '', v: msg.v || '' }
			chrome.storage.session.set( { auth } ).catch( () => {} )
		}
		return
	}

	if ( msg.type === 'peek_histories' ) {
		histories( msg.peers || [], msg.count || 2 )
			.then( res => reply( { ok: true, res } ) )
			.catch( error => reply( { ok: false, error: String( error && error.message || error ) } ) )
		return true
	}

} )

// execute за один запрос обслуживает до 25 вызовов API, поэтому режем пачками по 25.
async function histories( peers, count ) {

	if ( !auth.token ) throw new Error( 'no_token' )
	if ( !peers.length ) return {}

	const out = {}

	for ( let i = 0; i < peers.length; i += 25 ) {

		const chunk = peers.slice( i, i + 25 )

		const data = await call( 'execute', {
			code: EXECUTE_CODE,
			peers: chunk.join( ',' ),
			count: String( Math.max( 1, Math.min( 5, count ) ) ),
		} )

		for ( const row of data || [] ) {
			if ( !row || !row.h ) continue
			out[ row.id ] = {
				items: row.h.items || [],
				profiles: row.h.profiles || [],
				groups: row.h.groups || [],
			}
		}
	}

	return out
}

const EXECUTE_CODE = `
var peers = Args.peers.split(",");
var count = parseInt(Args.count);
var i = 0;
var res = [];
while (i < peers.length) {
	res.push({
		id: peers[i],
		h: API.messages.getHistory({
			peer_id: peers[i],
			count: count,
			extended: 1,
			fields: "first_name,last_name,name"
		})
	});
	i = i + 1;
}
return res;
`

async function call( method, params ) {

	const host = auth.host || FALLBACK_HOST
	const version = auth.v || FALLBACK_VERSION

	const body = new URLSearchParams( { ...params, access_token: auth.token, v: version, lang: 'ru' } )

	const res = await fetch( 'https://' + host + '/method/' + method, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	} )

	const json = await res.json()

	// execute отдаёт частичные ошибки в execute_errors, response при этом валиден.
	if ( json.error ) {
		if ( json.error.error_code === 5 ) {
			auth = { token: '', host: '', v: '' }
			chrome.storage.session.remove( 'auth' ).catch( () => {} )
		}
		throw new Error( json.error.error_msg || 'api_error' )
	}

	return json.response
}
