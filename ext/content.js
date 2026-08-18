// Peek, isolated world. Разворачивает превью в списке диалогов ВК.
//
// Ставка на то, что вёрстка ВК будет меняться, поэтому по классам ничего не ищем.
// Строку диалога находим по ссылке на /im, а само превью — по вычисленным стилям:
// берём тот элемент, который браузер реально обрезает. Если ничего не нашли,
// расширение молча ничего не делает и страницу не портит.

( function () {
	'use strict'

	const DEFAULTS = { on: true, lines: 5, messages: 2 }

	const ATTACH = {
		photo: 'Фотография',
		video: 'Видео',
		audio: 'Аудиозапись',
		audio_message: 'Голосовое сообщение',
		doc: 'Документ',
		sticker: 'Стикер',
		link: 'Ссылка',
		wall: 'Запись',
		wall_reply: 'Комментарий',
		market: 'Товар',
		poll: 'Опрос',
		gift: 'Подарок',
		graffiti: 'Граффити',
		call: 'Звонок',
		story: 'История',
	}

	let cfg = { ...DEFAULTS }
	let ours = false // пока true, свои же мутации в наблюдателе игнорируем
	let timer = 0
	let fetched_at = 0

	const cache = new Map() // peer_id -> { key, data }

	// --- настройки -----------------------------------------------------------

	chrome.storage.sync.get( DEFAULTS ).then( saved => {
		cfg = { ...DEFAULTS, ...saved }
		apply_vars()
		schedule()
	} ).catch( () => {} )

	chrome.storage.onChanged.addListener( ( changes, area ) => {
		if ( area !== 'sync' ) return
		for ( const key in changes ) cfg[ key ] = changes[ key ].newValue
		apply_vars()
		if ( !cfg.on || cfg.messages < 2 ) drop_own()
		schedule()
	} )

	function apply_vars() {
		const root = document.documentElement
		if ( !root ) return
		root.classList.toggle( 'peek_on', !!cfg.on )
		root.style.setProperty( '--peek-lines', String( cfg.lines ) )
		root.style.setProperty( '--peek-line-clamp', String( cfg.lines ) )
	}

	// --- токен из page world -------------------------------------------------

	window.addEventListener( 'message', event => {
		if ( event.source !== window ) return
		const msg = event.data
		if ( !msg || msg.__peek !== 'token' || !msg.token ) return
		try { chrome.runtime.sendMessage( { type: 'peek_token', token: msg.token } ) } catch ( e ) {}
	} )

	// --- поиск строк диалогов ------------------------------------------------

	function on_im() {
		return location.pathname === '/im' || location.pathname.startsWith( '/im/' )
	}

	function rows() {
		const groups = new Map()

		for ( const link of document.querySelectorAll( 'a[href*="/im"]' ) ) {
			if ( !peer_of( link.getAttribute( 'href' ) ) ) continue
			const row = link.closest( 'li, [role="listitem"], [role="option"]' ) || link
			const parent = row.parentElement
			if ( !parent ) continue
			let group = groups.get( parent )
			if ( !group ) groups.set( parent, group = new Set() )
			group.add( row )
		}

		let best = null
		for ( const group of groups.values() ) {
			if ( !best || group.size > best.size ) best = group
		}

		return best && best.size >= 3 ? [ ...best ] : []
	}

	function peer_of( href ) {
		if ( !href ) return 0

		const convo = /\/im\/convo\/(-?\d+)/.exec( href )
		if ( convo ) return Number( convo[ 1 ] )

		const sel = /[?&]sel=(c?)(-?\d+)/.exec( href )
		if ( sel ) return sel[ 1 ] ? 2000000000 + Number( sel[ 2 ] ) : Number( sel[ 2 ] )

		return 0
	}

	// --- поиск превью внутри строки -----------------------------------------

	function clamped( el ) {
		const style = getComputedStyle( el )
		if ( style.webkitLineClamp && style.webkitLineClamp !== 'none' ) return true
		if ( style.whiteSpace === 'nowrap' && style.textOverflow === 'ellipsis' ) return true
		return false
	}

	function own_text( el ) {
		for ( const node of el.childNodes ) {
			if ( node.nodeType === 3 && node.textContent.trim().length > 2 ) return true
		}
		return false
	}

	// Превью почти всегда последний обрезанный текстовый элемент строки:
	// выше него имя собеседника, оно тоже обрезано, но идёт раньше.
	function preview_of( row ) {
		let found = null
		for ( const el of row.querySelectorAll( '*' ) ) {
			if ( el.dataset.peek ) continue
			if ( !own_text( el ) ) continue
			if ( !clamped( el ) ) continue
			found = el
		}
		return found
	}

	function loosen( el, row ) {
		el.dataset.peek = 'text'
		for ( let parent = el.parentElement; parent && parent !== row.parentElement; parent = parent.parentElement ) {
			parent.dataset.peek = parent === row ? 'row' : 'loose'
		}
	}

	// --- основной проход -----------------------------------------------------

	function schedule() {
		clearTimeout( timer )
		timer = setTimeout( scan, 150 )
	}

	function scan() {
		if ( !cfg.on ) return
		if ( !document.body ) return
		if ( !on_im() ) return

		ours = true
		try {
			const list = rows()
			if ( !list.length ) return

			const want = []

			for ( const row of list ) {
				let prev = row.querySelector( ':scope [data-peek="text"]' )
				if ( !prev ) {
					prev = preview_of( row )
					if ( !prev ) continue
					loosen( prev, row )
				}

				if ( cfg.messages < 2 ) continue

				const peer = peer_from_row( row )
				if ( !peer ) continue

				const key = ( prev.textContent || '' ).trim()
				const hit = cache.get( peer )

				if ( hit && hit.key === key ) render( row, prev, peer, hit.data )
				else want.push( { peer, key } )
			}

			if ( want.length ) load( want )
		} finally {
			ours = false
		}
	}

	function peer_from_row( row ) {
		if ( row.matches( 'a[href]' ) ) {
			const peer = peer_of( row.getAttribute( 'href' ) )
			if ( peer ) return peer
		}
		for ( const link of row.querySelectorAll( 'a[href]' ) ) {
			const peer = peer_of( link.getAttribute( 'href' ) )
			if ( peer ) return peer
		}
		return 0
	}

	// --- дозагрузка истории --------------------------------------------------

	function load( want ) {
		const now = Date.now()
		if ( now - fetched_at < 1200 ) return
		fetched_at = now

		const peers = want.slice( 0, 50 ).map( item => item.peer )

		chrome.runtime.sendMessage( { type: 'peek_histories', peers, count: cfg.messages }, res => {
			if ( chrome.runtime.lastError ) return
			if ( !res || !res.ok ) return

			for ( const item of want ) {
				const data = res.res[ String( item.peer ) ]
				if ( data ) cache.set( item.peer, { key: item.key, data } )
			}

			schedule()
		} )
	}

	// --- отрисовка своего блока ---------------------------------------------

	function render( row, prev, peer, data ) {
		const items = ( data.items || [] ).slice( 0, cfg.messages ).reverse()
		if ( items.length < 2 ) return

		const key = items.map( msg => who_of( msg, data, peer ) + '' + text_of( msg ) ).join( '' )

		let box = row.querySelector( ':scope [data-peek="own"]' )
		if ( !box ) {
			box = document.createElement( 'div' )
			box.dataset.peek = 'own'
			try { prev.insertAdjacentElement( 'afterend', box ) } catch ( e ) { return }
		} else if ( box.dataset.peekKey === key ) {
			prev.dataset.peekHidden = '1'
			return
		}

		box.dataset.peekKey = key
		box.textContent = ''
		for ( const msg of items ) box.appendChild( line_node( msg, data, peer ) )

		prev.dataset.peekHidden = '1'
	}

	function line_node( msg, data, peer ) {
		const el = document.createElement( 'div' )
		el.dataset.peek = 'line'
		if ( !msg.out && msg.read_state === 0 ) el.dataset.peekUnread = '1'

		const who = who_of( msg, data, peer )
		if ( who ) {
			const tag = document.createElement( 'span' )
			tag.dataset.peek = 'who'
			tag.textContent = who + ': '
			el.appendChild( tag )
		}

		el.appendChild( document.createTextNode( text_of( msg ) ) )
		return el
	}

	function text_of( msg ) {
		const text = String( msg.text || '' ).replace( /\s+/g, ' ' ).trim()
		if ( text ) return text

		const attach = msg.attachments && msg.attachments[ 0 ]
		if ( attach ) return ATTACH[ attach.type ] || 'Вложение'
		if ( msg.fwd_messages && msg.fwd_messages.length ) return 'Пересланное сообщение'
		if ( msg.reply_message ) return 'Ответ на сообщение'
		if ( msg.action ) return 'Действие в беседе'
		return 'Пустое сообщение'
	}

	function who_of( msg, data, peer ) {
		if ( msg.out ) return 'Я'
		if ( peer > 0 && peer < 2000000000 ) return '' // личка, имя и так в заголовке строки

		for ( const profile of data.profiles || [] ) {
			if ( profile.id === msg.from_id ) return profile.first_name || ''
		}
		for ( const group of data.groups || [] ) {
			if ( -group.id === msg.from_id ) return group.name || ''
		}
		return ''
	}

	function drop_own() {
		ours = true
		try {
			for ( const box of document.querySelectorAll( '[data-peek="own"]' ) ) box.remove()
			for ( const el of document.querySelectorAll( '[data-peek-hidden]' ) ) delete el.dataset.peekHidden
		} finally {
			ours = false
		}
	}

	// --- запуск --------------------------------------------------------------

	function start() {
		apply_vars()

		new MutationObserver( () => { if ( !ours ) schedule() } )
			.observe( document.documentElement, { childList: true, subtree: true } )

		addEventListener( 'popstate', schedule )
		addEventListener( 'hashchange', schedule )

		schedule()
	}

	if ( document.readyState === 'loading' ) addEventListener( 'DOMContentLoaded', start, { once: true } )
	else start()
} )()
