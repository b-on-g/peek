namespace $ {

	$mol_test({

		'landing renders'() {
			const app = new $bog_peek_app
			$mol_assert_ok( app.Hero_title().text() )
			$mol_assert_ok( app.Download().uri() )
		},

	})

}
