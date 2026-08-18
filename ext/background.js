// Peek, service worker. Держит токен и ходит в api.vk.com пачками через execute.
// Из контент-скрипта в api.vk.com не ходим: там CSP страницы и лишние заголовки.

const API_VERSION = '5.131'

let token = ''

chrome.storage.session.get( { vk_token: '' } ).then( v => { token = v.vk_token || '' } ).catch( () => {} )

chrome.runtime.onMessage.addListener( ( msg, sender, reply ) => {

	if ( !msg || typeof msg.type !== 'string' ) return

	if ( msg.type === 'peek_token' ) {
		if ( msg.token && msg.token !== token ) {
			token = msg.token
			chrome.storage.session.set( { vk_token: token } ).catch( () => {} )
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

	if ( !token ) throw new Error( 'no_token' )
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

	const body = new URLSearchParams( { ...params, access_token: token, v: API_VERSION, lang: 'ru' } )

	const res = await fetch( 'https://api.vk.com/method/' + method, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	} )

	const json = await res.json()

	// execute отдаёт частичные ошибки в execute_errors, но response при этом валиден.
	if ( json.error ) {
		if ( json.error.error_code === 5 ) {
			token = ''
			chrome.storage.session.remove( 'vk_token' ).catch( () => {} )
		}
		throw new Error( json.error.error_msg || 'api_error' )
	}

	return json.response
}
