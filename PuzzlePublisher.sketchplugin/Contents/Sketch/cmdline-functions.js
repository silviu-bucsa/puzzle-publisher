@import "exporter/exporter-run.js"

// osascript -e 'quit app "Sketch"'
const example = `
/Applications/Sketch.app/Contents/Resources/sketchtool/bin/sketchtool --without-activating=YES --new-instance=No run ~/Library/Application\ Support/com.bohemiancoding.sketch3/Plugins/PuzzlePublisher.sketchplugin "cmdRun"  --context='{"file":"/Users/baza/GitHub/puzzle-publisher/tests/Links2.sketch","commands":"sync,export,publish,save,close"}'
`

function syncDocumentStyles(styles)
{
    log(" SYNCING " + styles.length + " STYLES ...")
    for (var style of styles)
    {
        if (null == style.getLibrary()) continue // we need only library-based style
        if (!style.syncWithLibrary())
        {
            log("  Failed to sync symbol " + style.name)
        }
    }
}

function syncDocument(document)
{
    const jSymbols = document.getSymbols()
    if (Settings.documentSettingForKey(document, SettingKeys.DOC_SKIP_AUTOSYNC) == 1)
    {
        log(" SKIP SYNCINC")
        return
    }
    log(" SYNCING " + jSymbols.length + " SYMBOLS ...")
    for (var master of jSymbols)
    {
        if (null == master.getLibrary()) continue // we need only library-based master

        if (!master.syncWithLibrary())
        {
            log("  Failed to sync symbol " + master.name)
            for (var i of master.getAllInstances())
            {
                log("     instance: " + i.name)
            }
        }
    }
    syncDocumentStyles(document.sharedTextStyles)
    syncDocumentStyles(document.sharedLayerStyles)
}

function exportDocument(context, runOptions)
{
    log(" EXPORTING...")
    runExporter(context, runOptions)
}

function publishDocument(context, document)
{
    log(" PUBLISHING...")
    context.fromCmd = true
    const publisher = new Publisher(context, document.sketchObject);
    publisher.authorName = "[BOT]";
    publisher.message = "--TELE";
    publisher.publish();
}

function showError(error)
{
    log(error + "\n")
    log("Command line example:")
    log(example + "\n")
}


function saveDocument(document)
{
    log(" SAVING DOCUMENT...")
    document.save(err =>
    {
        if (err)
        {
            log(" Failed to save a document. Error: " + err)
        }
    })
}

function closeDocument(document)
{
    log(" CLOSING DOCUMENT...")
    document.close()
}

var cmdRun = function (context)
{
    let Document = require('sketch/dom').Document

    // Parse command line arguments    
    let path = context.file + ""
    if ('' == path)
    {
        return showError("context.file is not specified")
    }

    log("PROCESS " + path)

    let argCommands = context.commands + ""
    if ('' == argCommands)
    {
        return showError("context.commands is not specified")
    }

    const commandsList = argCommands.split(',')
    const allCommands = ['save', 'sync', 'export', 'publish', 'close']
    const cmds = {}
    for (var cmd of allCommands)
    {
        cmds[cmd] = commandsList.includes(cmd)
    }

    // Open Sketch document 
    Document.open(path, (err, document) =>
    {
        if (err || !document)
        {
            log("ERROR: Can't open  " + path)
            return
        }

        if (cmds.sync) syncDocument(document)
        if (cmds.export)
        {
            const runOptions = {
                cmd: "exportHTML",
                mode: context.mode,
                fromCmd: true,
                nDoc: document.sketchObject,
                currentPage: context.currentPageID ? document.getLayerWithID(context.currentPageID) : undefined,
                customArtboardHeight: context.customArtboardHeight,
                customArtboardWidth: context.customArtboardWidth,
            }
            //
            if (Constants.EXPORT_MODE_CURRENT_PAGE == context.mode)
            {
            } else if (Constants.EXPORT_MODE_SELECTED_ARTBOARDS == context.mode)
            {
                runOptions.selectedArtboards = context.selectedArtboardIDS.split(",").map(id => document.getLayerWithID(id))
            }
            //
            exportDocument(context, runOptions)
        }
        if (cmds.save) saveDocument(document)
        if (cmds.publish) publishDocument(context, document)
        if (cmds.save) saveDocument(document)
        if (cmds.close) closeDocument(document)

    })

};


