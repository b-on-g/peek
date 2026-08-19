// Peek, isolated world. Разворачивает превью в списке диалогов ВК.
//
// Ставка на то, что вёрстка ВК будет меняться, поэтому по классам ничего не ищем.
// Строку диалога находим как повторяющийся элемент списка, а само превью — по
// вычисленным стилям: берём тот элемент, который браузер реально обрезает.
// Если ничего не нашли, расширение молча ничего не делает и страницу не портит.

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
	}

	// --- токен из page world -------------------------------------------------

	window.addEventListener( 'message', event => {
		if ( event.source !== window ) return
		const msg = event.data
		if ( !msg || msg.__peek !== 'auth' || !msg.token ) return
		try {
			chrome.runtime.sendMessage( { type: 'peek_auth', token: msg.token, host: msg.host, v: msg.v } )
		} catch ( e ) {}
	} )

	// --- поиск строк диалогов ------------------------------------------------

	function on_im() {
		return location.pathname === '/im' || location.pathname.startsWith( '/im/' )
	}

	// Кандидат в строку — элемент списка. Поднимаемся от него до уровня, на котором
	// у элемента появляются братья: ВК заворачивает каждый listitem в собственную
	// обёртку виртуального скролла, и без подъёма все «группы» будут по одному элементу.
	function rows() {

		const groups = new Map()

		const candidates = [
			...document.querySelectorAll( '[role="listitem"], [data-itemkey], li' ),
			// старая вёрстка вк.com, где строка диалога — обычная ссылка
			...[ ...document.querySelectorAll( 'a[href*="/im"]' ) ].filter( link => peer_of_link( link ) ),
		]

		for ( const item of candidates ) {

			let row = item
			while (
				row.parentElement
				&& row.parentElement !== document.body
				&& row.parentElement.children.length < 3
			) row = row.parentElement

			const parent = row.parentElement
			if ( !parent ) continue

			let group = groups.get( parent )
			if ( !group ) groups.set( parent, group = new Set() )
			group.add( row )
		}

		let best = null
		let best_area = 0

		for ( const group of groups.values() ) {

			if ( group.size < 3 ) continue

			// Внутри открытого диалога лента сообщений — тоже список, и площадью она
			// больше списка диалогов. Отличаем по тому, что у строки диалога есть peer:
			// у сообщения в ленте его нет, и трогать её мы не должны.
			let convos = 0
			let area = 0
			for ( const row of group ) {
				if ( conversational( row ) ) convos++
				const box = row.getBoundingClientRect()
				area += box.width * box.height
			}

			if ( convos < 3 || convos * 2 < group.size ) continue

			if ( area > best_area ) {
				best_area = area
				best = group
			}
		}

		return best ? [ ...best ].filter( conversational ) : []
	}

	function conversational( row ) {

		const keyed = row.matches( '[data-itemkey]' ) ? row : row.querySelector( '[data-itemkey]' )
		const key = keyed && keyed.getAttribute( 'data-itemkey' )
		if ( key && /^convo_-?\d+$/.test( key ) ) return true

		if ( row.matches( 'a[href]' ) && peer_of_link( row ) ) return true
		for ( const link of row.querySelectorAll( 'a[href]' ) ) {
			if ( peer_of_link( link ) ) return true
		}

		return false
	}

	function peer_of_row( row ) {

		const keyed = row.matches( '[data-itemkey]' ) ? row : row.querySelector( '[data-itemkey]' )
		const key = keyed && keyed.getAttribute( 'data-itemkey' )
		const convo = key && /^convo_(-?\d+)$/.exec( key )
		if ( convo ) return Number( convo[ 1 ] )

		// Запасной вариант: id svg-маски аватарки несёт тот же peer_id.
		const masked = row.querySelector( '[id*="Mask"]' )
		const mask = masked && /Mask(-?\d+)/.exec( masked.id )
		if ( mask ) return Number( mask[ 1 ] )

		// Старая вёрстка со ссылками.
		if ( row.matches( 'a[href]' ) ) {
			const own = peer_of_link( row )
			if ( own ) return own
		}
		for ( const link of row.querySelectorAll( 'a[href]' ) ) {
			const peer = peer_of_link( link )
			if ( peer ) return peer
		}

		return 0
	}

	function peer_of_link( link ) {

		const href = link.getAttribute( 'href' ) || ''

		const path = /\/im\/convo\/(-?\d+)/.exec( href )
		if ( path ) return Number( path[ 1 ] )

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

	// Обрезанных элементов в строке несколько: имя, превью, время, счётчик непрочитанного.
	// Имя и превью растянуты на всю ширину строки, время и счётчик узкие, поэтому узкие
	// отсекаем по ширине, а из оставшихся берём последний: превью всегда под именем.
	function preview_of( row ) {

		const found = []
		let wide = 0

		for ( const el of row.querySelectorAll( '*' ) ) {
			if ( el.dataset.peek ) continue
			if ( !( el.textContent || '' ).trim() ) continue
			if ( !clamped( el ) ) continue
			const width = el.getBoundingClientRect().width
			if ( !width ) continue
			found.push( [ el, width ] )
			if ( width > wide ) wide = width
		}

		let best = null
		for ( const [ el, width ] of found ) {
			if ( width < wide * .6 ) continue
			best = el
		}

		return best
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
				let prev = row.querySelector( '[data-peek="text"]' )
				if ( !prev ) {
					prev = preview_of( row )
					if ( !prev ) continue
					loosen( prev, row )
				}

				if ( cfg.messages < 2 ) {
					drop_own_in( row )
					continue
				}

				const peer = peer_of_row( row )
				if ( !peer ) continue

				// Виртуальный скролл переиспользует узлы под другие диалоги: если строка
				// сменила собеседника, старый блок надо убрать сразу, а не показывать
				// чужие сообщения до прихода новых.
				if ( row.dataset.peekPeer !== String( peer ) ) {
					row.dataset.peekPeer = String( peer )
					drop_own_in( row )
				}

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

	// --- дозагрузка истории --------------------------------------------------

	function load( want ) {
		const now = Date.now()
		if ( now - fetched_at < 1200 ) return
		fetched_at = now

		const peers = want.slice( 0, 40 ).map( item => item.peer )

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

		// В диалоге всего одно сообщение — показывать нечего, возвращаем штатное превью.
		if ( items.length < 2 ) {
			drop_own_in( row )
			return
		}

		const key = items.map( msg => who_of( msg, data, peer ) + '\n' + text_of( msg ) ).join( '\n' )

		let box = row.querySelector( '[data-peek="own"]' )

		// Реакт мог перерисовать превью и оставить наш блок висеть рядом с новым узлом.
		// Тогда видно и превью, и наш блок — те самые дубли. Перепривязываем.
		if ( box && box.previousElementSibling !== prev ) {
			box.remove()
			box = null
		}

		if ( !box ) {
			box = document.createElement( 'div' )
			box.dataset.peek = 'own'
			try { prev.insertAdjacentElement( 'afterend', box ) } catch ( e ) { return }
		} else if ( box.dataset.peekKey === key ) {
			prev.dataset.peekHidden = '1'
			return
		}

		for ( const extra of row.querySelectorAll( '[data-peek="own"]' ) ) {
			if ( extra !== box ) extra.remove()
		}

		// Забираем оформление у самого ВК, чтобы блок не выбивался ни в светлой теме, ни в тёмной.
		const style = getComputedStyle( prev )
		box.style.color = style.color
		box.style.font = style.font

		box.dataset.peekKey = key
		box.textContent = ''
		for ( const msg of items ) box.appendChild( line_node( msg, data, peer ) )

		prev.dataset.peekHidden = '1'
	}

	function line_node( msg, data, peer ) {

		const el = document.createElement( 'div' )
		el.dataset.peek = 'line'

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

	function drop_own_in( root ) {
		for ( const box of root.querySelectorAll( '[data-peek="own"]' ) ) box.remove()
		for ( const el of root.querySelectorAll( '[data-peek-hidden]' ) ) delete el.dataset.peekHidden
	}

	function drop_own() {
		ours = true
		try {
			drop_own_in( document )
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
