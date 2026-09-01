const DEFAULTS = { on: true, lines: 5 }

const on = document.getElementById( 'on' )
const lines = document.getElementById( 'lines' )
const lines_out = document.getElementById( 'lines_out' )

chrome.storage.sync.get( DEFAULTS ).then( cfg => {
	on.checked = !!cfg.on
	lines.value = cfg.lines
	show()
} )

function show() {
	lines_out.textContent = lines.value
}

function save() {
	show()
	chrome.storage.sync.set( {
		on: on.checked,
		lines: Number( lines.value ),
	} )
}

on.addEventListener( 'change', save )
lines.addEventListener( 'input', save )
