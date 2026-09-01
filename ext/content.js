// Peek, isolated world. Разворачивает превью в списке диалогов ВК.
//
// Ставка на то, что вёрстка ВК будет меняться, поэтому по классам ничего не ищем.
// Строку диалога находим как повторяющийся элемент списка, а само превью — по
// вычисленным стилям: берём тот элемент, который браузер реально обрезает.
// Если ничего не нашли, расширение молча ничего не делает и страницу не портит.
//
// Сеть не трогаем совсем: всё, что показывает Peek, уже есть на странице.

( function () {
	'use strict'

	const DEFAULTS = { on: true, lines: 5 }

	let cfg = { ...DEFAULTS }
	let timer = 0

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
		schedule()
	} )

	function apply_vars() {
		const root = document.documentElement
		if ( !root ) return
		root.classList.toggle( 'peek_on', !!cfg.on )
		root.style.setProperty( '--peek-lines', String( cfg.lines ) )
	}

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

	// Размечаем только атрибутами, узлов не добавляем и не удаляем: наблюдатель следит
	// за childList, так что сам себя проход не будит и реакту мы под руку не лезем.
	function scan() {
		if ( !cfg.on ) return
		if ( !document.body ) return
		if ( !on_im() ) return

		for ( const row of rows() ) {
			if ( row.querySelector( '[data-peek="text"]' ) ) continue
			const prev = preview_of( row )
			if ( !prev ) continue
			loosen( prev, row )
		}
	}

	// --- запуск --------------------------------------------------------------

	function start() {
		apply_vars()

		new MutationObserver( schedule )
			.observe( document.documentElement, { childList: true, subtree: true } )

		addEventListener( 'popstate', schedule )
		addEventListener( 'hashchange', schedule )

		schedule()
	}

	if ( document.readyState === 'loading' ) addEventListener( 'DOMContentLoaded', start, { once: true } )
	else start()
} )()
