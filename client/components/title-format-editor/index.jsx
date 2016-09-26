import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import {
	head,
	map,
	max,
	min,
} from 'lodash';

// The below is a `require()` statement becuase it needs to
// be loaded in after the polyfills are created.
const {
	CompositeDecorator,
	Editor,
	EditorState,
	Entity,
	Modifier,
	SelectionState,
} = require( 'draft-js' );

import Token from './token';
import { fromEditor, toEditor } from './parser';
import { buildSeoTitle } from 'state/sites/selectors';
import { getSelectedSite } from 'state/ui/selectors';
import { localize } from 'i18n-calypso';

const Chip = onClick => props => <Token { ...props } onClick={ onClick } />;

export class TitleFormatEditor extends Component {
	static propTypes = {
		type: PropTypes.object.isRequired,
		tokens: PropTypes.object.isRequired,
		onChange: PropTypes.func.isRequired
	};

	constructor( props ) {
		super( props );

		this.storeEditorReference = r => ( this.editor = r );
		this.focusEditor = () => this.editor.focus();

		this.updateEditor = this.updateEditor.bind( this );
		this.addToken = this.addToken.bind( this );
		this.removeToken = this.removeToken.bind( this );
		this.renderTokens = this.renderTokens.bind( this );
		this.editorStateFrom = this.editorStateFrom.bind( this );
		this.skipOverTokens = this.skipOverTokens.bind( this );

		this.state = {
			editorState: EditorState.moveFocusToEnd(
				this.editorStateFrom( props )
			)
		};
	}

	componentWillReceiveProps( nextProps ) {
		if ( this.props.disabled && ! nextProps.disabled ) {
			this.setState( {
				editorState: EditorState.moveFocusToEnd(
					this.editorStateFrom( nextProps )
				)
			} );
		}
	}

	editorStateFrom( props ) {
		return EditorState.createWithContent(
			toEditor( props.titleFormats, props.tokens ),
			new CompositeDecorator( [ {
				strategy: this.renderTokens,
				component: Chip( this.removeToken )
			} ] )
		);
	}

	/**
	 * Returns a new editorState that forces
	 * selection to hop over tokens, preventing
	 * navigating the cursor into a token
	 *
	 * @param {EditorState} editorState new state of editor after changes
	 * @returns {EditorState} maybe filtered state for editor
	 */
	skipOverTokens( editorState ) {
		const content = editorState.getCurrentContent();
		const selection = editorState.getSelection();

		// okay if we did not move the cursor
		const before = this.state.editorState.getSelection();
		const offset = selection.getFocusOffset();

		if (
			( before.getFocusKey() === selection.getFocusKey() ) &&
			( before.getFocusOffset() === offset )
		) {
			return editorState;
		}

		const block = content.getBlockForKey( selection.getFocusKey() );
		const direction = Math.sign( offset - before.getFocusOffset() );
		const entityKey = block.getEntityAt( offset );

		// okay if we are at the edges of the block
		if ( 0 === offset || block.getLength() === offset ) {
			return editorState;
		}

		// okay if we aren't in a token
		if ( ! entityKey ) {
			return editorState;
		}

		// get characters in entity
		const indices = block
			.getCharacterList()
			.reduce( ( ids, value, key ) => {
				return entityKey === value.entity
					? [ ...ids, key ]
					: ids;
			}, [] );

		// okay if cursor is at the spot
		// right before the token
		if ( offset === head( indices ) ) {
			return editorState;
		}

		const outside = direction > 0
			? Math.min( max( indices ) + 1, block.getLength() )
			: Math.max( min( indices ), 0 );

		return EditorState.forceSelection(
			editorState,
			selection
				.set( 'anchorOffset', outside )
				.set( 'focusOffset', outside )
		);
	}

	updateEditor( rawEditorState, { doFocus = false } = {} ) {
		const { onChange, type } = this.props;
		const currentContent = rawEditorState.getCurrentContent();

		// limit to one line
		if ( currentContent.getBlockMap().size > 1 ) {
			return;
		}

		const editorState = this.skipOverTokens( rawEditorState );

		this.setState(
			{ editorState },
			() => {
				doFocus && this.focusEditor();
				onChange( type.value, fromEditor( currentContent ) );
			}
		);
	}

	addToken( title, name ) {
		return () => {
			const { editorState } = this.state;
			const currentSelection = editorState.getSelection();

			const tokenEntity = Entity.create( 'TOKEN', 'IMMUTABLE', { name } );

			const contentState = Modifier.replaceText(
				editorState.getCurrentContent(),
				currentSelection,
				` ${ title } `,
				null,
				tokenEntity
			);

			this.updateEditor( EditorState.push(
				editorState,
				contentState,
				'add-token'
			), { doFocus: true } );
		};
	}

	removeToken( entityKey ) {
		return () => {
			const { editorState } = this.state;
			const currentContent = editorState.getCurrentContent();
			const currentSelection = editorState.getSelection();

			const block = currentContent.getBlockForKey( currentSelection.focusKey );

			// get characters in entity
			const indices = block
				.getCharacterList()
				.reduce( ( ids, value, key ) => {
					return entityKey === value.entity
						? [ ...ids, key ]
						: ids;
				}, [] );

			const range = SelectionState
				.createEmpty( block.key )
				.set( 'anchorOffset', min( indices ) )
				.set( 'focusOffset', max( indices ) );

			const withoutToken = EditorState.push(
				editorState,
				Modifier.removeRange(
					currentContent,
					range,
					'forward'
				),
				'remove-range'
			);

			const selectionBeforeToken = EditorState.forceSelection(
				withoutToken,
				range
					.set( 'anchorOffset', min( indices ) )
					.set( 'focusOffset', min( indices ) )
			);

			this.updateEditor( selectionBeforeToken );
		};
	}

	renderTokens( contentBlock, callback ) {
		contentBlock.findEntityRanges(
			character => {
				const entity = character.getEntity();

				if ( null === entity ) {
					return false;
				}

				return 'TOKEN' === Entity.get( entity ).getType();
			},
			callback
		);
	}

	render() {
		const { editorState } = this.state;
		const {
			titleData,
			translate,
			tokens,
			type
		} = this.props;

		const previewText = type.value
			? buildSeoTitle( { [ type.value ]: fromEditor( editorState.getCurrentContent() ) }, type.value, titleData )
			: '';

		const formattedPreview = previewText
			? `${ translate( 'Preview' ) }: ${ previewText }`
			: '';

		return (
			<div className="title-format-editor">
				<div className="title-format-editor__header">
					<span className="title-format-editor__title">{ type.label }</span>
					{ map( tokens, ( title, name ) => (
						<span
							key={ name }
							className="title-format-editor__button"
							onClick={ this.addToken( title, name ) }
						>
							{ title }
						</span>
					) ) }
				</div>
				<div className="title-format-editor__editor-wrapper">
					<Editor
						editorState={ editorState }
						onChange={ this.updateEditor }
						ref={ this.storeEditorReference }
					/>
				</div>
				<div className="title-format-editor__preview">{ formattedPreview }</div>
			</div>
		);
	}
}

const mapStateToProps = ( state, ownProps ) => {
	const site = getSelectedSite( state );
	const { translate } = ownProps;

	// Add example content for post/page title, tag name and archive dates
	return ( {
		titleData: {
			site,
			post: { title: translate( 'Example Title' ) },
			tag: translate( 'Example Tag' ),
			date: translate( 'August 2016' )
		}
	} );
};

export default localize( connect( mapStateToProps )( TitleFormatEditor ) );
