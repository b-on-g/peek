namespace $ {

	const prose = {
		maxWidth: '44rem',
		align: {
			self: 'center',
		},
	} as const

	const column = {
		flex: {
			basis: '18rem',
			grow: 1,
			shrink: 1,
		},
		minWidth: 0,
		gap: $mol_gap.text,
	} as const

	const card = {
		background: {
			color: $mol_theme.card,
		},
		padding: $mol_gap.block,
		gap: $mol_gap.block,
		border: {
			radius: $mol_gap.round,
		},
		flex: {
			wrap: 'nowrap',
		},
		minWidth: 0,
		align: {
			items: 'flex-start',
		},
	} as const

	const avatar = {
		flex: 'none',
		width: '2.5rem',
		height: '2.5rem',
		borderRadius: '50%',
		background: {
			color: $mol_theme.line,
		},
	} as const

	const caption = {
		color: $mol_theme.shade,
		font: {
			size: '.75rem',
		},
		textTransform: 'uppercase',
		letterSpacing: '.06em',
	} as const

	const body = {
		flex: {
			basis: 0,
			grow: 1,
			shrink: 1,
		},
		minWidth: 0,
		gap: '.25rem',
	} as const

	const name = {
		font: {
			weight: 'bold',
		},
	} as const

	const text = {
		color: $mol_theme.shade,
	} as const

	$mol_style_define( $bog_peek_app, {

		Content: {
			align: {
				items: 'center',
			},
			gap: $mol_gap.block,
			padding: {
				bottom: $mol_gap.space,
			},
		},

		Hero: {
			...prose,
			padding: {
				top: $mol_gap.block,
			},
			gap: $mol_gap.block,
		},

		Hero_title: {
			font: {
				size: '1.75rem',
			},
		},

		Hero_lead: {
			color: $mol_theme.shade,
			font: {
				size: '1.05rem',
			},
			lineHeight: '1.6',
		},

		Hero_actions: {
			gap: $mol_gap.block,
			flex: {
				wrap: 'wrap',
			},
			align: {
				items: 'center',
			},
		},

		Download: {
			background: {
				color: $mol_theme.current,
			},
			color: $mol_theme.back,
			font: {
				weight: 'bold',
			},
			padding: {
				left: $mol_gap.block,
				right: $mol_gap.block,
			},
		},

		Demo: {
			...prose,
			width: '100%',
			gap: $mol_gap.block,
			flex: {
				wrap: 'wrap',
			},
		},

		Before: column,
		After: column,

		Before_cap: caption,
		After_cap: caption,

		Before_row: card,
		After_row: card,

		Before_ava: avatar,
		After_ava: avatar,

		Before_body: body,
		After_body: body,

		Before_name: name,
		After_name: name,

		Before_text: {
			...text,
			whiteSpace: 'nowrap',
			overflow: 'hidden',
			textOverflow: 'ellipsis',
		},

		After_text_1: text,
		After_text_2: text,

		Install: prose,
		Options: prose,
		Privacy: prose,
		Next: prose,

	} )

}
