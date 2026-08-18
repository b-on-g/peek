// Peek, page world. Единственная задача — подсмотреть access_token, которым веб-клиент ВК
// сам ходит в api.vk.com, и отдать его в isolated world через postMessage.
// Токен никуда, кроме самого api.vk.com, не уезжает.

( function () {
	'use strict'

	let last = ''

	function send( token ) {
		if ( !token || token === last ) return
		last = token
		window.postMessage( { __peek: 'token', token }, location.origin )
	}

	function grab( str ) {
		if ( typeof str !== 'string' ) return
		const found = /[?&]access_token=([^&#\s"']+)/.exec( str )
		if ( found ) send( decodeURIComponent( found[ 1 ] ) )
	}

	function is_api( url ) {
		return typeof url === 'string' && url.includes( 'api.vk.com/method/' )
	}

	const open_orig = XMLHttpRequest.prototype.open
	const send_orig = XMLHttpRequest.prototype.send

	XMLHttpRequest.prototype.open = function ( method, url ) {
		try { this.__peek_url = String( url ) } catch ( e ) {}
		return open_orig.apply( this, arguments )
	}

	XMLHttpRequest.prototype.send = function ( body ) {
		try {
			if ( is_api( this.__peek_url ) ) {
				grab( this.__peek_url )
				if ( typeof body === 'string' ) grab( '&' + body )
				if ( body instanceof URLSearchParams ) grab( '&' + body.toString() )
			}
		} catch ( e ) {}
		return send_orig.apply( this, arguments )
	}

	const fetch_orig = window.fetch

	window.fetch = function ( input, init ) {
		try {
			const url = typeof input === 'string' ? input : ( input && input.url ) || ''
			if ( is_api( url ) ) {
				grab( url )
				const body = init && init.body
				if ( typeof body === 'string' ) grab( '&' + body )
				if ( body instanceof URLSearchParams ) grab( '&' + body.toString() )
			}
		} catch ( e ) {}
		return fetch_orig.apply( this, arguments )
	}
} )()
