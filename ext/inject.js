// Peek, page world. Единственная задача — подсмотреть access_token, которым веб-клиент ВК
// сам ходит в свой API, и отдать его в isolated world через postMessage.
// Токен уходит только обратно в тот же API и никуда больше.
//
// Хост API у ВК не один: старый веб зовёт api.vk.com, новый мессенджер — web.api.vk.ru.
// Поэтому смотрим на любой запрос с /method/ в пути и запоминаем хост вместе с токеном.
// Запросы летят при загрузке страницы и при подгрузке списка, так что скрипт обязан
// стоять на document_start, иначе первую пачку он пропустит.

( function () {
	'use strict'

	let last = ''

	function send( auth ) {
		if ( !auth.token || auth.token === last ) return
		last = auth.token
		window.postMessage( { __peek: 'auth', token: auth.token, host: auth.host, v: auth.v }, location.origin )
	}

	function params_of( body ) {
		if ( typeof body === 'string' ) {
			try { return new URLSearchParams( body ) } catch ( e ) { return null }
		}
		if ( body instanceof URLSearchParams ) return body
		if ( typeof FormData !== 'undefined' && body instanceof FormData ) return body
		return null
	}

	function grab( url, body ) {
		try {
			const target = new URL( url, location.href )
			if ( !target.pathname.includes( '/method/' ) ) return

			const token = target.searchParams.get( 'access_token' )
				|| ( params_of( body ) && params_of( body ).get( 'access_token' ) )
			if ( !token ) return

			send( {
				token,
				host: target.host,
				v: target.searchParams.get( 'v' ) || '',
			} )
		} catch ( e ) {}
	}

	const open_orig = XMLHttpRequest.prototype.open
	const send_orig = XMLHttpRequest.prototype.send

	XMLHttpRequest.prototype.open = function ( method, url ) {
		try { this.__peek_url = String( url ) } catch ( e ) {}
		return open_orig.apply( this, arguments )
	}

	XMLHttpRequest.prototype.send = function ( body ) {
		if ( this.__peek_url ) grab( this.__peek_url, body )
		return send_orig.apply( this, arguments )
	}

	const fetch_orig = window.fetch

	window.fetch = function ( input, init ) {
		const url = typeof input === 'string' ? input : ( input && input.url ) || ''
		if ( url ) grab( url, init && init.body )
		return fetch_orig.apply( this, arguments )
	}
} )()
