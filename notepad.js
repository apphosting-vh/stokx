/* ══════════════════════════════════════════════════════════════════════════
   Notepad — Rich text notes with CRUD, colors, pinning, search
   Data stored in IndexedDB via dbGetSetting / dbSetSetting under "stox_notes"
   ══════════════════════════════════════════════════════════════════════════ */
window.NotepadPage = (function () {

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;
  var useRef = React.useRef;

  var LS_KEY = "stox_notes";

  var NOTE_COLORS = [
    null,
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#a855f7",
  ];

  var NOTE_COLOR_BG = {};
  NOTE_COLOR_BG[null] = "";
  var noteBg = function (c) {
    if (!c) return "";
    var r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + ",0.08)";
  };

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    var now = new Date();
    var diff = (now - d) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function stripHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return d.textContent || d.innerText || "";
  }

  function truncate(str, len) {
    if (!str || str.length <= len) return str || "";
    return str.substring(0, len) + "...";
  }

  /* ── SVG Icons (inline for self-containment) ── */
  function Icon(size, path) {
    return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
      typeof path === "string"
        ? React.createElement("path", { d: path })
        : path.map(function (p) { return React.createElement("path", { d: p }); })
    );
  }

  var PENCIL = "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z";
  var SEARCH = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" + " " + "M18 18l-3.3-3.3";
  var PLUS = "M12 5v14M5 12h14";
  var TRASH = "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2";
  var PIN = "M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";
  var BOLD = "M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zM6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z";
  var ITALIC = "M19 4h-9M14 20H5M15 4L9 20";
  var UNDERLINE = "M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M4 21h16";
  var STRIKE = "M6 12h12M8 6a4 4 0 0 1 8 0M12 12v6";
  var HEADING1 = "M4 4v16M18 4v16M4 12h14M20 4v12l3-3";
  var HEADING2 = "M4 4v16M18 4v16M4 12h9";
  var HEADING3 = "M4 4v16M18 4v16M4 12h9M14 12l4 4";
  var LIST = "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01";
  var LIST_ORDERED = "M10 6h10M10 12h10M10 18h10M4 6l2-2v6M4 14l2-1-2 3h2";
  var QUOTE = "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z";
  var UNDO = "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11";
  var REDO = "M15 14l5-5-5-5M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13";
  var PALETTE = "M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.22-1.16-.58-1.59-.36-.43-.58-.97-.58-1.58 0-1.38 1.12-2.5 2.5-2.5H17c3.31 0 6-2.69 6-6 0-4.96-4.49-9-11-9zM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-4 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z";
  var CLOSE = "M18 6L6 18M6 6l12 12";
  var ARROW_LEFT = "M15 18l-6-6 6-6";
  var NOTE = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6";

  function SvgIcon(s, path, vb) {
    return React.createElement("svg", { width: s || 16, height: s || 16, viewBox: vb || "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
      typeof path === "string"
        ? React.createElement("path", { d: path })
        : path.map(function (p) { return React.createElement("path", { key: p, d: p }); })
    );
  }

  var ToolbarBtn = React.memo(function ToolbarBtn(props) {
    var active = props.active, label = props.label, title = props.title, onClick = props.onClick, d = props.path, s = props.size;
    return React.createElement("button", {
      title: title || label,
      onClick: onClick,
      style: {
        width: s || 30, height: s || 30, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6, border: "none", cursor: "pointer", background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--text4)", fontSize: 11, fontWeight: 700, transition: "all .12s",
        fontFamily: "var(--font-body)"
      }
    }, d ? SvgIcon(14, d) : label);
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NoteEditor Component
     ══════════════════════════════════════════════════════════════════════════ */
  function NoteEditor(props) {
    var note = props.note, onSave = props.onSave, onDelete = props.onDelete, onBack = props.onBack;
    var titleRef = useRef(null);
    var bodyRef = useRef(null);
    var saveTimer = useRef(null);
    var savedRange = useRef(null);
    var [showColorPicker, setShowColorPicker] = useState(false);
    var [activeFormats, setActiveFormats] = useState({});
    var [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(function () {
      if (titleRef.current) {
        titleRef.current.focus();
        titleRef.current.setSelectionRange(titleRef.current.value.length, titleRef.current.value.length);
      }
    }, []);

    var getNote = useCallback(function () {
      return {
        id: note.id,
        title: titleRef.current ? titleRef.current.value : note.title,
        content: bodyRef.current ? bodyRef.current.innerHTML : note.content,
        pinned: note.pinned,
        color: note.color,
        createdAt: note.createdAt,
        updatedAt: new Date().toISOString()
      };
    }, [note]);

    var scheduleSave = useCallback(function () {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(function () {
        onSave(getNote());
      }, 500);
    }, [onSave, getNote]);

    var saveRange = useCallback(function () {
      var sel = window.getSelection();
      if (sel.rangeCount > 0 && bodyRef.current && bodyRef.current.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange();
      }
    }, []);

    var restoreRange = useCallback(function () {
      if (!savedRange.current) return;
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
      savedRange.current = null;
    }, []);

    var handleCmd = useCallback(function (cmd, val) {
      if (bodyRef.current) bodyRef.current.focus();
      restoreRange();
      document.execCommand(cmd, false, val || null);
      scheduleSave();
      var fmts = { bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline"), strikethrough: document.queryCommandState("strikeThrough") };
      setActiveFormats(fmts);
    }, [scheduleSave, restoreRange]);

    var handleHeading = useCallback(function (tag) {
      if (bodyRef.current) bodyRef.current.focus();
      restoreRange();
      document.execCommand("formatBlock", false, "<" + tag + ">");
      scheduleSave();
    }, [scheduleSave, restoreRange]);

    var handleKeyDown = useCallback(function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave(getNote());
      }
    }, [onSave, getNote]);

    var handleColorPick = useCallback(function (c) {
      setShowColorPicker(false);
      if (bodyRef.current) bodyRef.current.focus();
      restoreRange();
      if (c) { document.execCommand("foreColor", false, c); } else { document.execCommand("removeFormat"); }
      scheduleSave();
    }, [scheduleSave, restoreRange]);

    var handleDelete = useCallback(function () {
      setConfirmDelete(true);
    }, []);
    var handleDeleteConfirm = useCallback(function () {
      setConfirmDelete(false);
      onDelete(note.id);
    }, [note, onDelete]);
    var handleDeleteCancel = useCallback(function () {
      setConfirmDelete(false);
    }, []);

    var handleTogglePin = useCallback(function () {
      onSave(Object.assign({}, getNote(), { pinned: !note.pinned }));
    }, [note, onSave, getNote]);

    var checkFormats = useCallback(function () {
      saveRange();
      var fmts = { bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline"), strikethrough: document.queryCommandState("strikeThrough") };
      setActiveFormats(fmts);
    }, [saveRange]);

    var colorSwatches = NOTE_COLORS.map(function (c) {
      var isActive = note.color === c;
      return React.createElement("button", {
        key: c || "default", title: c || "Default",
        onClick: function () {
          onSave(Object.assign({}, getNote(), { color: c }));
        },
        style: {
          width: 22, height: 22, borderRadius: "50%", border: isActive ? "2px solid var(--accent)" : "2px solid transparent",
          cursor: "pointer", background: c || "var(--bg5)", padding: 0, outline: "none",
          boxShadow: isActive ? "0 0 0 2px var(--accent2)" : "none"
        }
      });
    });

    var editorStyle = {
      padding: "0 18px 18px",
      borderRadius: 12,
      background: noteBg(note.color) || "var(--bg3)",
      border: "1px solid " + (note.color ? note.color + "33" : "var(--border)"),
    };

    var toolbarStyle = {
      display: "flex", gap: 2, flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--border)",
      marginBottom: 10, alignItems: "center"
    };

    return React.createElement("div", { style: editorStyle },
      /* Toolbar */
      React.createElement("div", { style: toolbarStyle },
        React.createElement(ToolbarBtn, { path: BOLD, title: "Bold (Ctrl+B)", active: activeFormats.bold, onClick: function () { handleCmd("bold"); }, size: 30 }),
        React.createElement(ToolbarBtn, { path: ITALIC, title: "Italic (Ctrl+I)", active: activeFormats.italic, onClick: function () { handleCmd("italic"); }, size: 30 }),
        React.createElement(ToolbarBtn, { path: UNDERLINE, title: "Underline (Ctrl+U)", active: activeFormats.underline, onClick: function () { handleCmd("underline"); }, size: 30 }),
        React.createElement(ToolbarBtn, { path: STRIKE, title: "Strikethrough", active: activeFormats.strikethrough, onClick: function () { handleCmd("strikeThrough"); }, size: 30 }),
        React.createElement("div", { style: { width: 1, height: 20, background: "var(--border)", margin: "0 4px" } }),
        React.createElement(ToolbarBtn, { label: "H1", title: "Heading 1", onClick: function () { handleHeading("h1"); }, size: 30 }),
        React.createElement(ToolbarBtn, { label: "H2", title: "Heading 2", onClick: function () { handleHeading("h2"); }, size: 30 }),
        React.createElement(ToolbarBtn, { label: "H3", title: "Heading 3", onClick: function () { handleHeading("h3"); }, size: 30 }),
        React.createElement("div", { style: { width: 1, height: 20, background: "var(--border)", margin: "0 4px" } }),
        React.createElement(ToolbarBtn, { path: LIST, title: "Bullet List", onClick: function () { handleCmd("insertUnorderedList"); }, size: 30 }),
        React.createElement(ToolbarBtn, { path: LIST_ORDERED, title: "Numbered List", onClick: function () { handleCmd("insertOrderedList"); }, size: 30 }),
        React.createElement(ToolbarBtn, { path: QUOTE, title: "Blockquote", onClick: function () { handleCmd("formatBlock", "blockquote"); }, size: 30 }),
        React.createElement("div", { style: { width: 1, height: 20, background: "var(--border)", margin: "0 4px" } }),
        React.createElement(ToolbarBtn, { path: UNDO, title: "Undo", onClick: function () { handleCmd("undo"); }, size: 30 }),
        React.createElement(ToolbarBtn, { path: REDO, title: "Redo", onClick: function () { handleCmd("redo"); }, size: 30 }),
        React.createElement("div", { style: { width: 1, height: 20, background: "var(--border)", margin: "0 4px" } }),
        React.createElement("div", { style: { position: "relative", display: "inline-block" } },
          React.createElement(ToolbarBtn, { path: PALETTE, title: "Text Color", onClick: function () { setShowColorPicker(!showColorPicker); }, size: 30 }),
          showColorPicker && React.createElement("div", {
            style: {
              position: "absolute", top: "100%", left: 0, zIndex: 100, marginTop: 4,
              display: "flex", gap: 3, padding: 5, borderRadius: 8,
              background: "var(--bg4)", border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,.15)"
            }
          },
            [{ c: "#ef4444", l: "Red" }, { c: "#f97316", l: "Orange" }, { c: "#eab308", l: "Yellow" }, { c: "#22c55e", l: "Green" }, { c: "#3b82f6", l: "Blue" }, { c: "#a855f7", l: "Purple" }, { c: null, l: "Default" }].map(function (opt) {
              return React.createElement("button", {
                key: opt.c || "def", title: opt.l,
                onClick: function () { handleColorPick(opt.c); },
                style: {
                  width: 22, height: 22, borderRadius: 4, border: "1px solid var(--border6)",
                  cursor: "pointer", background: opt.c || "var(--bg5)", padding: 0
                }
              });
            })
          )
        )
      ),

      /* Title */
      React.createElement("input", {
        ref: titleRef,
        defaultValue: note.title || "",
        placeholder: "Note title...",
        onChange: scheduleSave,
        onKeyDown: handleKeyDown,
        style: {
          width: "100%", boxSizing: "border-box", padding: "6px 0", fontSize: 16, fontWeight: 700,
          background: "transparent", border: "none", outline: "none",
          color: "var(--text)", fontFamily: "'Sora',sans-serif", marginBottom: 8
        }
      }),

      /* Content editable */
      React.createElement("div", {
        ref: bodyRef,
        contentEditable: true,
        suppressContentEditableWarning: true,
        onInput: scheduleSave,
        onKeyDown: handleKeyDown,
        onMouseUp: checkFormats,
        onKeyUp: checkFormats,
        dangerouslySetInnerHTML: { __html: note.content || "" },
        style: {
          minHeight: 120, padding: "6px 0", fontSize: 13, lineHeight: 1.7,
          color: "var(--text2)", background: "transparent", outline: "none",
          fontFamily: "var(--font-body)", wordBreak: "break-word",
          cursor: "text"
        }
      }),

      /* Footer */
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }
      },
        confirmDelete
          ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "flex-end" } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Delete this note?"),
            React.createElement("button", {
              onClick: handleDeleteConfirm,
              style: {
                padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 600
              }
            }, "Yes"),
            React.createElement("button", {
              onClick: handleDeleteCancel,
              style: {
                padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer",
                background: "var(--bg4)", color: "var(--text5)", fontSize: 10, fontWeight: 600
              }
            }, "No")
          )
          : React.createElement(React.Fragment, null,
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
              React.createElement("button", {
                title: note.pinned ? "Unpin" : "Pin note",
                onClick: handleTogglePin,
                style: {
                  padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: note.pinned ? "rgba(251,191,36,.15)" : "transparent",
                  color: note.pinned ? "#fbbf24" : "var(--text5)", fontSize: 12
                }
              }, SvgIcon(14, PIN, "0 0 24 24")),
              React.createElement("div", { style: { display: "flex", gap: 3 } }, colorSwatches)
            ),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
              React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, fmtDate(note.updatedAt || note.createdAt)),
              React.createElement("button", {
                title: "Delete note",
                onClick: handleDelete,
                style: {
                  padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,.25)",
                  cursor: "pointer", background: "rgba(239,68,68,.08)", color: "#ef4444",
                  fontSize: 10, fontWeight: 600, fontFamily: "var(--font-body)"
                }
              }, "Delete")
            )
          )
      )
    );
  }

  /* ══════════════════════════════════════════════════════════════════════════
     NoteCard Component
     ══════════════════════════════════════════════════════════════════════════ */
  var NoteCard = React.memo(function(props) {
    var note = props.note, onClick = props.onClick, onPin = props.onPin, onDelete = props.onDelete;
    var [confirmDelete, setConfirmDelete] = useState(false);

    var preview = truncate(stripHtml(note.content), 120);
    var title = note.title || "Untitled";
    var bg = noteBg(note.color);
    var borderColor = note.color ? note.color + "33" : "var(--border)";

    if (confirmDelete) {
      return React.createElement("div", {
        style: {
          borderRadius: 10, padding: "14px 16px",
          background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.25)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10
        }
      },
        React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } },
          "Delete \"" + title + "\"?"
        ),
        React.createElement("div", { style: { display: "flex", gap: 6 } },
          React.createElement("button", {
            onClick: function (e) { e.stopPropagation(); setConfirmDelete(false); onDelete(note.id); },
            style: {
              padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 600
            }
          }, "Yes"),
          React.createElement("button", {
            onClick: function (e) { e.stopPropagation(); setConfirmDelete(false); },
            style: {
              padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer",
              background: "var(--bg4)", color: "var(--text5)", fontSize: 10, fontWeight: 600
            }
          }, "No")
        )
      );
    }

    return React.createElement("div", {
      onClick: function () { onClick(note); },
      style: {
        borderRadius: 10, padding: "14px 16px", cursor: "pointer",
        background: bg || "var(--bg3)", border: "1px solid " + borderColor,
        transition: "all .15s", position: "relative",
        display: "flex", flexDirection: "column", gap: 6,
        overflow: "hidden"
      },
      onMouseEnter: function (e) {
        e.currentTarget.style.borderColor = note.color || "var(--accent)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)";
      },
      onMouseLeave: function (e) {
        e.currentTarget.style.borderColor = borderColor;
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }
    },
      /* Color strip */
      note.color && React.createElement("div", {
        style: {
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: note.color, borderRadius: "10px 10px 0 0"
        }
      }),
      /* Header: title + pin */
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
        React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "'Sora',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, display: "flex", alignItems: "center", gap: 4 } },
          note.pinned ? SvgIcon(13, PIN, "0 0 24 24") : null,
          title
        ),
        React.createElement("div", { style: { display: "flex", gap: 4, flexShrink: 0 } },
          React.createElement("button", {
            title: note.pinned ? "Unpin" : "Pin",
            onClick: function (e) { e.stopPropagation(); onPin(note.id); },
            style: {
              width: 24, height: 24, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", color: note.pinned ? "#fbbf24" : "var(--text6)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontSize: 10
            }
            }, SvgIcon(14, PIN, "0 0 24 24")),
          React.createElement("button", {
            title: "Delete",
            onClick: function (e) { e.stopPropagation(); setConfirmDelete(true); },
            style: {
              width: 24, height: 24, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", color: "var(--text6)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0
            }
          }, SvgIcon(14, CLOSE))
        )
      ),
      /* Content preview */
      React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" } },
        preview || "No content"
      ),
      /* Timestamp */
      React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", marginTop: "auto" } },
        fmtDate(note.updatedAt || note.createdAt)
      )
    );
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NotepadPage — Main Component
     ══════════════════════════════════════════════════════════════════════════ */
  function NotepadPage() {
    var [notes, setNotes] = useState([]);
    var [loaded, setLoaded] = useState(false);
    var [search, setSearch] = useState("");
    var [selectedId, setSelectedId] = useState(null);
    var [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(function () {
      var handler = function () { setIsMobile(window.innerWidth < 768); };
      window.addEventListener("resize", handler);
      return function () { window.removeEventListener("resize", handler); };
    }, []);

    /* Load notes from IDB */
    useEffect(function () {
      (async function () {
        try {
          var val = await dbGetSetting(LS_KEY);
          if (val && Array.isArray(val)) setNotes(val);
        } catch (e) {}
        setLoaded(true);
      })();
    }, []);

    var saveNotes = useCallback(function (arr) {
      setNotes(arr);
      dbSetSetting(LS_KEY, arr).then(function () {
        window.dispatchEvent(new CustomEvent("stox:data-changed"));
      }).catch(function (e) { console.error("[Notepad] dbSetSetting failed:", e); });
    }, []);

    var handleCreate = useCallback(function () {
      var now = new Date().toISOString();
      var newNote = { id: Date.now(), title: "", content: "", pinned: false, color: null, createdAt: now, updatedAt: now };
      var updated = [newNote].concat(notes);
      saveNotes(updated);
      setSelectedId(newNote.id);
    }, [notes, saveNotes]);

    var handleSave = useCallback(function (updated) {
      setNotes(function (prev) {
        var idx = prev.findIndex(function (n) { return n.id === updated.id; });
        if (idx >= 0) {
          var copy = prev.slice();
          copy[idx] = updated;
          dbSetSetting(LS_KEY, copy).then(function () {
            window.dispatchEvent(new CustomEvent("stox:data-changed"));
          }).catch(function (e) { console.error("[Notepad] dbSetSetting failed:", e); });
          return copy;
        }
        var all = [updated].concat(prev);
        dbSetSetting(LS_KEY, all).then(function () {
          window.dispatchEvent(new CustomEvent("stox:data-changed"));
        }).catch(function (e) { console.error("[Notepad] dbSetSetting failed:", e); });
        return all;
      });
    }, []);

    var handleDelete = useCallback(function (id) {
      setNotes(function (prev) {
        var filtered = prev.filter(function (n) { return n.id !== id; });
        dbSetSetting(LS_KEY, filtered).then(function () {
          window.dispatchEvent(new CustomEvent("stox:data-changed"));
        }).catch(function (e) { console.error("[Notepad] dbSetSetting failed:", e); });
        return filtered;
      });
      setSelectedId(function (sid) { return sid === id ? null : sid; });
    }, []);

    var handleTogglePin = useCallback(function (id) {
      setNotes(function (prev) {
        var updated = prev.map(function (n) {
          return n.id === id ? Object.assign({}, n, { pinned: !n.pinned, updatedAt: new Date().toISOString() }) : n;
        });
        dbSetSetting(LS_KEY, updated).then(function () {
          window.dispatchEvent(new CustomEvent("stox:data-changed"));
        }).catch(function (e) { console.error("[Notepad] dbSetSetting failed:", e); });
        return updated;
      });
    }, []);

    var selected = useMemo(function () {
      if (!selectedId) return null;
      return notes.find(function (n) { return n.id === selectedId; }) || null;
    }, [notes, selectedId]);

    /* Filter + sort: pinned first, then by updatedAt desc */
    var displayed = useMemo(function () {
      var q = search.trim().toLowerCase();
      var filtered = q ? notes.filter(function (n) { return (n.title || "").toLowerCase().indexOf(q) >= 0 || stripHtml(n.content).toLowerCase().indexOf(q) >= 0; }) : notes;
      var pinned = [], other = [];
      filtered.forEach(function (n) {
        if (n.pinned) pinned.push(n); else other.push(n);
      });
      pinned.sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
      other.sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
      return { pinned: pinned, other: other, hasPinned: pinned.length > 0 };
    }, [notes, search]);

    var cardStyle = {
      boxSizing: "border-box", maxWidth: 900, margin: "0 auto", padding: isMobile ? "14px 12px" : "20px 24px"
    };

    if (!loaded) {
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: { textAlign: "center", padding: 48, color: "var(--text5)", fontSize: 14 } }, "Loading notes...")
      );
    }

    /* ── Editor view (desktop right panel or mobile full) ── */
    if (selected) {
      if (!isMobile) {
        /* Desktop: show list + editor side by side */
        return React.createElement("div", { style: Object.assign({}, cardStyle, { maxWidth: 1200 }) },
          React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "'Sora',sans-serif", color: "var(--text)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 } },
            React.createElement("span", { style: { color: "var(--accent)" } }, SvgIcon(22, PENCIL, "0 0 24 24")),
            "Notepad"
          ),
          React.createElement("div", { style: { display: "flex", gap: 16, alignItems: "flex-start" } },
            /* Left: notes list */
            React.createElement("div", { style: { width: "40%", minWidth: 280 } },
              /* Search + New */
              React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } },
                React.createElement("div", { style: { flex: 1, position: "relative" } },
                  React.createElement("input", {
                    type: "text", placeholder: "Search notes...", value: search,
                    onChange: function (e) { setSearch(e.target.value); },
                    style: {
                      width: "100%", boxSizing: "border-box", padding: "8px 12px", paddingLeft: 32, fontSize: 12,
                      borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg4)",
                      color: "var(--text2)", outline: "none", fontFamily: "var(--font-body)"
                    }
                  }),
                  React.createElement("span", { style: { position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text6)", display: "flex", pointerEvents: "none" } }, SvgIcon(14, SEARCH))
                ),
                React.createElement("button", {
                  onClick: handleCreate,
                  style: {
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 14px", fontSize: 12, fontWeight: 600,
                    borderRadius: 8, border: "none", cursor: "pointer",
                    background: "var(--accent)", color: "#fff", fontFamily: "var(--font-body)", whiteSpace: "nowrap"
                  }
                }, SvgIcon(14, PLUS), " New")
              ),
              /* Notes list */
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 200px)", overflowY: "auto" } },
                displayed.hasPinned && React.createElement("div", { key: "pinned-hdr", style: { fontSize: 10, fontWeight: 700, color: "var(--text6)", letterSpacing: 1, textTransform: "uppercase", padding: "4px 2px" } }, "Pinned"),
                displayed.pinned.map(function (n) {
                  return React.createElement(NoteCard, { key: n.id, note: n, onClick: function () { setSelectedId(n.id); }, onPin: handleTogglePin, onDelete: handleDelete });
                }),
                displayed.hasPinned && displayed.other.length > 0 && React.createElement("div", { key: "other-hdr", style: { fontSize: 10, fontWeight: 700, color: "var(--text6)", letterSpacing: 1, textTransform: "uppercase", padding: "4px 2px", marginTop: 4 } }, "Other"),
                displayed.other.map(function (n) {
                  return React.createElement(NoteCard, { key: n.id, note: n, onClick: function () { setSelectedId(n.id); }, onPin: handleTogglePin, onDelete: handleDelete });
                }),
                notes.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 32, color: "var(--text6)", fontSize: 12, fontStyle: "italic" } },
                  "No notes yet. Click \"+ New\" to create one."
                )
              )
            ),
            /* Right: editor */
            React.createElement("div", { style: { flex: 1, position: "sticky", top: 20 } },
              React.createElement(NoteEditor, { note: selected, onSave: handleSave, onDelete: handleDelete, onBack: function () { setSelectedId(null); } })
            )
          )
        );
      } else {
        /* Mobile: full screen editor */
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
            React.createElement("button", {
              onClick: function () { setSelectedId(null); },
              style: {
                padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                background: "var(--bg4)", color: "var(--text5)", fontSize: 12, fontFamily: "var(--font-body)",
                display: "inline-flex", alignItems: "center", gap: 4
              }
            }, SvgIcon(14, ARROW_LEFT), " Back"),
            React.createElement("div", { style: { fontSize: 16, fontWeight: 700, fontFamily: "'Sora',sans-serif", color: "var(--text)" } }, "Edit Note")
          ),
          React.createElement(NoteEditor, { note: selected, onSave: handleSave, onDelete: handleDelete, onBack: function () { setSelectedId(null); } })
        );
      }
    }

    /* ── List view ── */
    return React.createElement("div", { style: cardStyle },
      React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "'Sora',sans-serif", color: "var(--text)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("span", { style: { color: "var(--accent)", display: "inline-flex" } }, SvgIcon(22, PENCIL, "0 0 24 24")),
        "Notepad",
        notes.length > 0 && React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text6)", marginLeft: 4 } }, "(" + notes.length + ")")
      ),
      /* Search + New */
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
        React.createElement("div", { style: { flex: 1, position: "relative" } },
          React.createElement("input", {
            type: "text", placeholder: "Search notes...", value: search,
            onChange: function (e) { setSearch(e.target.value); },
            style: {
              width: "100%", boxSizing: "border-box", padding: "8px 12px", paddingLeft: 32, fontSize: 12,
              borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg4)",
              color: "var(--text2)", outline: "none", fontFamily: "var(--font-body)"
            }
          }),
          React.createElement("span", { style: { position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text6)", display: "flex", pointerEvents: "none" } }, SvgIcon(14, SEARCH))
        ),
        React.createElement("button", {
          onClick: handleCreate,
          style: {
            display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 14px", fontSize: 12, fontWeight: 600,
            borderRadius: 8, border: "none", cursor: "pointer",
            background: "var(--accent)", color: "#fff", fontFamily: "var(--font-body)", whiteSpace: "nowrap"
          }
        }, SvgIcon(14, PLUS), " New Note")
      ),
      /* Notes grid */
      displayed.hasPinned && React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "var(--text6)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 } }, "Pinned"),
      displayed.pinned.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: 16 } },
        displayed.pinned.map(function (n) {
          return React.createElement(NoteCard, { key: n.id, note: n, onClick: function () { setSelectedId(n.id); }, onPin: handleTogglePin, onDelete: handleDelete });
        })
      ),
      displayed.other.length > 0 && React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "var(--text6)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 } }, "Other"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 } },
        displayed.other.map(function (n) {
          return React.createElement(NoteCard, { key: n.id, note: n, onClick: function () { setSelectedId(n.id); }, onPin: handleTogglePin, onDelete: handleDelete });
        })
      ),
      notes.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 48, color: "var(--text6)", fontSize: 13, fontStyle: "italic" } },
        React.createElement("div", { style: { opacity: 0.3, marginBottom: 12 } }, SvgIcon(48, NOTE)),
        "No notes yet",
        React.createElement("div", { style: { marginTop: 6, fontSize: 11 } }, "Click \"+ New Note\" to create your first note.")
      )
    );
  }

  return React.memo(NotepadPage);
})();
