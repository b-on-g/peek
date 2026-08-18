const DEFAULTS = { on: true, lines: 5, messages: 2 }

const on = document.getElementById( 'on' )
const lines = document.getElementById( 'lines' )
const messages = document.getElementById( 'messages' )
const lines_out = document.getElementById( 'lines_out' )
const messages_out = document.getElementById( 'messages_out' )
const hint = document.getElementById( 'hint' )

chrome.storage.sync.get( DEFAULTS ).then( cfg => {
	on.checked = !!cfg.on
	lines.value = cfg.lines
	messages.value = cfg.messages
	show()
} )

function show() {
	lines_out.textContent = lines.value
	messages_out.textContent = messages.value

	if ( Number( messages.value ) > 1 ) {
		hint.textContent = 'Прошлые сообщения подтягиваются из самого ВК. Если их не видно, обновите вкладку vk.ru/im.'
	} else {
		hint.textContent = 'Настройки применяются сразу, страницу перезагружать не нужно.'
	}
}

function save() {
	show()
	chrome.storage.sync.set( {
		on: on.checked,
		lines: Number( lines.value ),
		messages: Number( messages.value ),
	} )
}

on.addEventListener( 'change', save )
lines.addEventListener( 'input', save )
messages.addEventListener( 'input', save )
