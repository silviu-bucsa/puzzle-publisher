@import("constants.js")
@import("lib/utils.js")
@import("lib/ga.js")
@import("lib/uidialog.js")

@import "miro/api.js";
@import "miro/utils.js";

let publisher = null

Api.prototype.artboardsToPNG = function (context, exportAll, scale)
{
    return publisher.miroExportInfoList
}

class Publisher
{
    constructor(context, doc)
    {
        this.doc = doc;
        this.UI = require('sketch/ui')
        this.context = context;
        this.Settings = require('sketch/settings');

        this.login = ''
        this.sshPort = ''
        this.siteRoot = ''
        this.ver = ''
        this.remoteFolder = ''

        this.allMockupsdDir = Utils.getPluginSetting(SettingKeys.PLUGIN_EXPORTING_URL, '1')
        this.serverToolsPath = Utils.getPluginSetting(SettingKeys.PLUGIN_SERVERTOOLS_PATH)
        this.authorName = Utils.getPluginSetting(SettingKeys.PLUGIN_AUTHOR_NAME)
        this.authorEmail = Utils.getPluginSetting(SettingKeys.PLUGIN_AUTHOR_EMAIL)
        this.commentsURL = Utils.getPluginSetting(SettingKeys.PLUGIN_COMMENTS_URL)

        this.curlPath = Utils.getPluginSetting(SettingKeys.PLUGIN_PUBLISH_CURL_PATH)
        if(this.curlPath==="") this.curlPath = Constants.CURL_PATH
        this.filesChunkLimit = 50

        this.docFolder = this.doc.cloudName();
        let posSketch = this.docFolder.indexOf(".sketch")
        if (posSketch > 0)
        {
            this.docFolder = this.docFolder.slice(0, posSketch)
        }

        this.message = Utils.getPluginSetting(SettingKeys.PLUGIN_PUBLISH_LAST_MSG)
        publisher = this

        this.story = null
        this.mockupsPath = this.allMockupsdDir + "/" + this.docFolder
        this.fullImagesPath = this.mockupsPath + "/" + Constants.IMAGES_DIRECTORY + Constants.FULLIMAGE_DIRECTORY

        this.miroExportInfoList = []
        this.miroEnabled = null

        this.userID = Utils.getUserID()
    }


    readOptions()
    {
        // read current version from document settings
        let Settings = this.Settings

        this.ver = Settings.documentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_VERSION)
        if (this.ver == undefined || this.ver == null) this.ver = '1'

        this.login = Settings.settingForKey(SettingKeys.PLUGIN_PUBLISH_LOGIN)
        if (this.login == undefined || this.login == null) this.login = ''

        this.sshPort = Settings.settingForKey(SettingKeys.PLUGIN_PUBLISH_SSH_PORT)
        if (this.sshPort == undefined || this.sshPort == null || this.sshPort == '') this.sshPort = '22'

        this.siteRoot = Settings.settingForKey(SettingKeys.PLUGIN_PUBLISH_SITEROOT)
        if (this.siteRoot == undefined || this.siteRoot == null) this.siteRoot = ''

        this.secret = Settings.settingForKey(SettingKeys.PLUGIN_PUBLISH_SECRET)
        if (this.secret == undefined || this.secret == null) this.secret = ''

        this.remoteFolder = Settings.documentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_REMOTE_FOLDER)
        if (this.remoteFolder == undefined || this.remoteFolder == null) this.remoteFolder = ''

        this.miroEnabled = null == this.miroEnabled ? Settings.settingForKey(SettingKeys.PLUGIN_PUBLISH_MIRO_ENABLED) == 1 : this.miroEnabled
        this.miroBoards = null
        if (this.miroEnabled)
        {
            this.miroBoardName = Utils.getDocSetting(this.doc, SettingKeys.DOC_PUBLISH_MIRO_BOARD)
            this.oldMiroBoardName = this.miroBoardName
            this.miroBoardID = Utils.getDocSetting(this.doc, SettingKeys.DOC_PUBLISH_MIRO_BOARDID)
            if (("" == this.miroBoardID || "" == this.miroBoardName) && (this.miroBoardID + this.miroBoardName) != '')
            {
                this._initMiro()
                this._validateMiroParams()
            }
        }

        this.authorName = Settings.settingForKey(SettingKeys.PLUGIN_AUTHOR_NAME)
        if (this.authorName == undefined || this.authorName == '') this.authorName = 'None'
        this.authorEmail = Settings.settingForKey(SettingKeys.PLUGIN_AUTHOR_EMAIL)
        if (this.authorEmail == undefined || this.authorEmail == '') this.authorEmail = 'None'

        this.commentsURL = Settings.settingForKey(SettingKeys.PLUGIN_COMMENTS_URL)
        if (this.commentsURL == undefined) this.commentsURL = ''

        ///        
        //
        return true
    }

    log(msg)
    {
        //log(msg)
    }

    publish()
    {
        this.readOptions()

        if (!this.checkMockupExists(this.allMockupsdDir, this.docFolder))
        {
            return false
        }

        // Show this.UI
        if (!this.context.fromCmd)
        {
            while (true)
            {
                if (!this.askOptions()) return false
                if (this.checkOptions()) break
            }
        }

        const version = this.ver
        let destFolder = this.remoteFolder
        if ('' == destFolder) return true
        // drop trailed /
        destFolder = destFolder.replace(/(\/)$/, "")


        // copy publish script
        if (!this.copyScript("publish.sh")) return false
        if (!this.copyScript("preparePublish.sh")) return false
        

        // 
        if (this.miroEnabled && this.miroBoardID != "")
        {
            this.publishToMiro()
        }

        this.Settings.setSettingForKey(SettingKeys.PLUGIN_PUBLISH_LAST_MSG, this.message)

        // run publish script
        this.tempFolder = this.allMockupsdDir+"/_tmp/"+this.docFolder
        log("tempFolder="+this.tempFolder)

        let commentsID = destFolder
        commentsID = Utils.toFilename(commentsID)
        let runResult = this.runPreparationScript(version, this.allMockupsdDir, this.docFolder, destFolder, commentsID)
        if (!runResult.result){
            this.showMessage(runResult)
            return false
        }
        if(this.login!=="")
            runResult = this.runPublishScript(version, this.allMockupsdDir, this.docFolder, destFolder, commentsID)
        else
            runResult = this.publishMockupsByHTTPS(destFolder, commentsID)

        track(TRACK_PUBLISH_COMPLETED)
        // success
        if (runResult.result)
        {
            const openURL = this.siteRoot + destFolder + (version == "-1" ? "" : ("/" + version)) + "/index.html"
            const announceFolder = destFolder + (version == "-1" ? "" : ("/" + version))

            // save changed document
            log(" SAVING DOCUMENT...")
            const Dom = require('sketch/dom')
            const jDoc = Dom.fromNative(this.doc)
            jDoc.save(err =>
            {
                if (err)
                {
                    log(" Failed to save a document. Error: " + err)
                }
            })
            // inform server about new version
            if (this.message != "--" && this.serverToolsPath != "")
            {
                try
                {
                    var url = this.siteRoot + this.serverToolsPath + Constants.SERVER_ANNOUNCE_SCRIPT
                    url += "?author=" + encodeURI(this.authorName).replace(/[#]/g, '')
                    if ("" != this.authorEmail) url += "&email=" + encodeURI(this.authorEmail).replace(/[#]/g, '')
                    if ("" != this.secret) url += "&sec=" + encodeURI(this.secret).replace(/[#]/g, '')
                    url += "&msg=" + encodeURI(this.message).replace(/[#]/g, '')
                    url += "&ver=" + encodeURI(this.ver).replace(/[#]/g, '')
                    url += "&dir=" + encodeURI(announceFolder).replace(/[#]/g, '')
                    if (this.message.includes('--NOTELE'))
                    {
                        url += "&NOTELE=1"
                    }
                    if (DEBUG)
                    {
                        log(url)
                    }
                    var nURL = NSURL.URLWithString(url);
                    var data = NSData.dataWithContentsOfURL(nURL);

                    //var json = NSJSONSerialization.JSONObjectWithData_options_error(data, 0, nil)
                    //log(json)

                } catch (e)
                {
                    log("Exception: " + e);
                }
            }
            if (!this.context.fromCmd)
            {
                // open browser                
                if (this.siteRoot != '')
                {
                    const openResult = Utils.runCommand('/usr/bin/open', [openURL])
                    log(" OPENING PUBLISHED PAGE...")
                    if (openResult.result)
                    {
                    } else
                    {
                        this.UI.alert('Can not open HTML in browser', openResult.output)
                    }
                }
                this.Settings.setSettingForKey(SettingKeys.PLUGIN_PUBLISH_LAST_MSG, "")
                this.showMessage(runResult)
            }
        } else
        {
            this.showMessage(runResult)
            return false
        }

        return true
    }

    publishToMiro(standalone = false)
    {
        if (standalone)
        {
            this.miroEnabled = true
            this.readOptions()
        }
        if (standalone && !this.askMiroOptions()) return false


        try
        {
            log("publishToMiro: start")

            // Load story.js file and eval it
            const storyPath = this.mockupsPath + "/data/story.js"
            let storyJS = Utils.readFile(storyPath)
            if (undefined == storyJS)
            {
                this.UI.alert('Error', "Can't find mockups on path: " + this.mockupsPath)
                return false
            }
            String.prototype.replaceAllMe = function (search, replacement)
            {
                return this.split(search).join(replacement)
            }
            storyJS = Utils.readFile(storyPath).replace("var story = {", "this.story = {")
            storyJS = storyJS.replaceAllMe("$.extend(new ViewerPage(),", "").replaceAllMe("})", "}")
            eval(storyJS)

            // Build page list
            this.miroExportInfoList = this.getArtboardsListForMiro()

            // Publish        
            log("publishToMiro: start publishing")
            const result = api.uploadArtboardsToRTB(this.context, this.miroBoardID, true)
            if (result != api.UploadEnum.SUCCESS)
            {
                throw "Failed to publish"
            }

            // Show in browser
            if (standalone)
            {
                var fullBoardURL = boardURL + this.miroBoardID;
                const openResult = Utils.runCommand('/usr/bin/open', [fullBoardURL])
                if (openResult.result)
                {
                } else
                {
                    this.UI.alert('Can not open HTML in browser', openResult.output)
                }
                require('sketch/ui').alert('Success', 'Published successfully')
            }
        }
        catch (error)
        {
            this.UI.alert('Publishing to Miro failed', error)
        }
        finally
        {
            log("publishToMiro: done")
        }
    }


    getArtboardsListForMiro()
    {
        var imagePath = this.fullImagesPath
        var exportInfoList = [];
        const Dom = require('sketch/dom')
        const jDoc = Dom.fromNative(publisher.doc)

        let errors = ""

        log("Miro: build page list: start")
        for (var page of this.story.pages.filter(el => "external" != el.type))
        {
            const artboard = jDoc.getLayerWithID(page["id"])
            if (!artboard)
            {
                //if ("" != errors) errors += "\n"
                //errors += page['title']
                continue
            }
            var exportInfo = { "artboardID": page["id"], "artboard": artboard.sketchObject, "path": imagePath + page['image'] };
            exportInfoList.push(exportInfo);
        }
        log("Miro: build page list: done")
        if ("" != errors)
        {
            this.UI.alert('Can not find by ID the following artboards', errors)
            return null
        }
        return exportInfoList;
    }



    showMessage(result)
    {
        if (result.result)
        {
            this.UI.alert('Success', PublishKeys.SHOW_OUTPUT ? result.output : 'Mockups published!')
        } else
        {
            this.showOutput(result)
        }
    }

    showOutput(result)
    {
        if (result.result && !PublishKeys.SHOW_OUTPUT) return true
        this.UI.alert(result.result ? 'Output' : 'Error', result.output)
    }

    checkOptions()
    {

        if (this.ver == '')
        {
            this.UI.alert('Error', 'Version should be specified')
            return false
        }     
        if (this.remoteFolder == '')
        {
            this.UI.alert('Error', 'Remote site folder should be specified')
            return false
        }
        return true
    }


    askOptions()
    {
        let Settings = this.Settings

        let askMessage = '' != this.serverToolsPath
        let askMiro = this.miroEnabled

        if(this.login==="" &&  this.siteRoot===""){
            publisher.UI.alert("Error", "Configure SFTP login ot HTTPS Site URL")
            return false
        }        

        // show dialod        
        const dialog = new UIDialog("Publish HTML", NSMakeRect(0, 0, 400,
            180 + (askMessage ? 65 : 0) + (askMiro ? 60 : 0)),
            "Publish", "Generated HTML will be uploaded to external site by SFTP.")
        dialog.removeLeftColumn()

        if (askMessage)
        {
            dialog.addTextBox("message", "Change Description", this.message, 'Added Remove button', 40)
            dialog.addHint("messageHint", "Describe briefly was changed")
        }

        dialog.addTextInput("version", "Version", this.ver, '1', 50)
        dialog.addHint("versionHint", "Exporter will publish two HTML sets - live and <version>")

        dialog.addTextInput("remoteFolder", "Remote Site Folder", this.remoteFolder, 'myprojects/project1', 350)
        dialog.addHint("remoteFolderHint", "Relative path on server")

        if (askMiro)
        {
            this.addMiroBoardSelector(dialog, 350, " (optional)")
        }


        track(TRACK_PUBLISH_DIALOG_SHOWN)
        while (true)
        {
            const result = dialog.run()
            if (!result)
            {
                track(TRACK_PUBLISH_DIALOG_CLOSED, { "cmd": "cancel" })
                return false
            }

            // Read data
            if (askMiro)
            {
                this.miroBoardName = dialog.views['miroBoard'].stringValue() + ""
            }

            this.remoteFolder = dialog.views['remoteFolder'].stringValue() + ""

            if (askMessage)
            {
                this.message = dialog.views['message'].stringValue() + ""
            }

            let ver = dialog.views['version'].stringValue() + ""
            let verInt = parseInt(ver)
            this.ver = ver

            // check data
            if (askMiro)
            {
                if ("" == this.miroBoardName)
                {
                    // Set empty board
                    this.miroBoardID = ""
                    this.miroBoardIndex = -1
                } else if (this.oldMiroBoardName != this.miroBoardName)
                {
                    // Change name

                    // load Miro boards to find the new ID
                    if (!this._initMiro()) return false
                    this.miroBoardIndex = this.miroBoards.boards.indexOf(this.miroBoardName)
                    this.miroBoardID = this.miroBoardIndex >= 0 ? this.miroBoards.indexIdsMap[this.miroBoardIndex] : ""
                }
                if ("" != this.miroBoardName && "" == this.miroBoardID)
                {
                    this.UI.alert("Error", "No such board in Miro")
                    continue
                }
            }
            if ('' == this.remoteFolder) continue
            if ('' == this.ver) continue
            if (askMessage && '' == this.message) continue


            dialog.finish()
            track(TRACK_PUBLISH_DIALOG_CLOSED, { "cmd": "ok" })
            // save new version into document settings         
            if (askMiro)
            {
                Settings.setDocumentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_MIRO_BOARDID, this.miroBoardID)
                Settings.setDocumentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_MIRO_BOARD, this.miroBoardName)
            }

            Settings.setDocumentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_REMOTE_FOLDER, this.remoteFolder)
            Settings.setDocumentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_VERSION, (verInt >= 0 ? verInt + 1 : verInt) + "")
            return true
        }
        return false
    }

    askMiroOptions()
    {
        if (!this._initMiro() || !this._validateMiroParams()) return false

        const dialog = new UIDialog("Select Miro Board ", NSMakeRect(0, 0, 350, 60), "Select", "Previously exported pages will be uploaded to Miro whiteboard as images")
        dialog.removeLeftColumn()
        dialog.addSelect("miroBoard", "", this.miroBoardIndex, this.miroBoards.boards, 350)

        while (true)
        {
            const result = dialog.run()
            if (!result)
            {
                return false
            }
            const miroBoardIndex = dialog.views['miroBoard'].indexOfSelectedItem()
            if (0 > miroBoardIndex)
            {
                publisher.UI.alert("Error", "Miro board should be specified")
                continue
            }
            let miroBoardID = this.miroBoards.indexIdsMap[miroBoardIndex]
            if ("" == miroBoardID)
            {
                publisher.UI.alert("Error", "Miro board should be specified")
                continue
            }
            this.miroBoardID = miroBoardID

            dialog.finish()
            // save 
            this.Settings.setDocumentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_MIRO_BOARDID, this.miroBoardID)
            if (this.oldMiroBoardName != "") this.Settings.setDocumentSettingForKey(this.doc, SettingKeys.DOC_PUBLISH_MIRO_BOARD, "")

            return true
        }
        return false
    }

    addMiroBoardSelector(dialog, width = 520, inlineHintPostfix = "")
    {

        //dialog.addTextInput("miroBoard", "Miro board", this.miroBoard, 'Board name', 350)

        const input = dialog.addPathInput({
            id: "miroBoard", label: "Miro board", labelSelect: "Select",
            textValue: this.miroBoardName,
            inlineHint: 'Board name' + inlineHintPostfix, width,
            customHandler: function ()
            {
                if (!publisher._initMiro()) return false

                const dialog = new UIDialog("Select Miro Board ", NSMakeRect(0, 0, 350, 60), "Select")
                dialog.removeLeftColumn()

                const currentBoard = input.stringValue() + ""
                let currentBoardIndex = currentBoard != "" ? publisher.miroBoards.boards.indexOf(currentBoard) : 0
                if (currentBoardIndex < 0) currentBoardIndex = 0

                dialog.addSelect("miroBoard", "", currentBoardIndex, publisher.miroBoards.boards, 350)

                while (true)
                {
                    const result = dialog.run()
                    if (!result)
                    {
                        return false
                    }
                    const miroBoardIndex = dialog.views['miroBoard'].indexOfSelectedItem()
                    if (0 > miroBoardIndex)
                    {
                        publisher.UI.alert("Error", "Miro board should be specified")
                        continue
                    }
                    input.setStringValue(publisher.miroBoards.boards[miroBoardIndex])

                    dialog.finish()
                    // save 
                    return true
                }
                return false
            }
        })
    }

    checkMockupExists(allMockupsdDir, docFolder)
    {
        const fullPath = allMockupsdDir + "/" + docFolder
        if (Utils.isFolderExists(fullPath)) return true
        this.UI.alert('Error', `Local HTML is not found on \n${fullPath}\n\nYou need to run Export to HTML before publishing`)
        return false
    }


    runPreparationScript(version, allMockupsdDir, docFolder,remoteFolder,commentsID) {
        let args = [version, allMockupsdDir, docFolder, remoteFolder, commentsID]
        args.push(this.login)
        args.push(this.sshPort)
        args.push(this.authorName)
        args.push(this.authorEmail)
        args.push(this.commentsURL.replace(/(\/)/g, '\\/'))
        args.push(this.tempFolder)
        //args.push(Constants.MIRROR2)        
        return this.runScriptWithArgs("preparePublish.sh", args)
    }


    runPublishScript(version, allMockupsdDir, docFolder, remoteFolder, commentsID) {
        let args = [version, allMockupsdDir, docFolder, remoteFolder, commentsID]
        args.push(this.login)
        args.push(this.sshPort)
        args.push(this.authorName)
        args.push(this.authorEmail)
        args.push(this.commentsURL.replace(/(\/)/g, '\\/'))
        args.push(this.tempFolder)
        //args.push(Constants.MIRROR2)        
        return this.runScriptWithArgs("publish.sh", args)
    }

    publishMockupsByHTTPS(remoteFolder)
    {
        const fullPath = this.tempFolder
        const localImagesPath = fullPath + "/images"

        //////////// PUBLISH IMAGES /////////
        this.publishedImages = 0
        // Publish images im /images folder
        let res = this.publishImagesInFolderByHTTPS(localImagesPath, "2x")
        if (res && !res.result) return res

        // Publish images im /images/full folder
        res = this.publishImagesInFolderByHTTPS(localImagesPath + "/full", "full")
        if (res && !res.result) return res
        // Publish images im /images/full folder
        res = this.publishImagesInFolderByHTTPS(localImagesPath + "/previews", "preview")
        if (res && !res.result) return res

        //////////// PUBLISH OTHJER /////////
        res = this.publishFilesByHTTPS(fullPath, ["index.html"])
        if (res && !res.result) return res
        const folders = ["data", "resources", "js", "js/other"]
        folders.forEach(function (folderName)
        {
            res = this.publishFilesInFolderByHTTPS(fullPath, folderName)
            if (res && !res.result) return res
        }, this)

        // COMPLETE
        res = this.publishCompleteByHTTPS(fullPath)
        if (res && !res.result) return res

        return res
    }


    publishCompleteByHTTPS(fullPath)
    {
        let args = ["--no-progress-meter"]
        const cmd = "cms"
        let url = this.siteRoot + this.serverToolsPath + "/upload.php?cmd=" + cmd
        url += `&tid=${encodeURI(this.secret)}`
        url += `&uid=${encodeURI(this.userID)}`
        url += `&ver=${encodeURI(this.ver)}`
        url += `&docid=${encodeURI(this.remoteFolder)}`
        args.push(url)

        return Utils.runCommand(this.curlPath, args)
    }

    publishImagesInFolderByHTTPS(localPath, defaultImageType)
    {
        if (!Utils.isFolderExists(localPath)) return {
            result: 0,
            output: "No folder on path " + localPath
        }


        const allImages = Utils.listFiles(localPath)
        let result = null

        // process images
        let fileNames = []
        allImages.forEach(function (file)
        {
            if (result && !result.result) return
            const fileName = file + ""
            if (!(fileName.endsWith(".png") || fileName.endsWith(".jpg"))) return
            //        
            const imageType = fileName.includes("@2x.") ? "2x" : defaultImageType
            //
            if (DEBUG) log(`Upload #${this.publishedImages} ${fileName}`)
            fileNames.push(fileName)
        }, this);
        //  
        return this.publishFilesByHTTPS(localPath, fileNames, defaultImageType)             
    }

    publishFilesInFolderByHTTPS(localPath, folderName)
    {
        const fullLocalPath = localPath + "/" + folderName
        const allFiles = Utils.listFiles(fullLocalPath)
        let result = null

        // process files
        let fileNames = []
        allFiles.forEach(function (file)
        {
            if (result && !result.result) return
            const fileName = file + ""
            if (fileName === "other") return
            //
            if (DEBUG) log(`Upload ${fileName}`)          
            fileNames.push(fileName)  
        }, this);
        //       
        result = this.publishFilesByHTTPS(fullLocalPath, fileNames, "", folderName)
        if (!result.result) log(result.output)
        return result
    }


    publishFilesByHTTPS(filePath, fileNames, imageType = "", dirType = "")
    {                
        let result = null
        let chunk = []        
        fileNames.forEach(function(fileName){
            chunk.push(fileName)
            if(chunk.length===this.filesChunkLimit){
                result = this.publishFilesChunkByHTTPS(filePath, chunk, imageType, dirType)
                //
                chunk = []                
            }
        },this)        
        if(chunk.length) result = this.publishFilesChunkByHTTPS(filePath, chunk, imageType, dirType)
        return result
    }

    publishFilesChunkByHTTPS(filePath, fileNames, imageType, dirType)
    {       
        if(DEBUG) log(filePath)
        if(DEBUG) log(fileNames)
        let isStart = this.publishedImages++==0
        const cmd = imageType != "" ? "uploadFrame" : "uploadFile"
        let args = ["--no-progress-meter","-X","POST","-H","Content-Type: multipart/form-data"]
        let url = this.siteRoot + this.serverToolsPath + "/upload.php?cmd=" + cmd
        url += `&tid=${encodeURI(this.secret)}`
        url += `&uid=${encodeURI(this.userID)}`
        url += `&s=${isStart ? 1 : 0}`
        if (imageType != "") url += `&t=${imageType}`
        if (dirType != "") url += `&dt=${dirType}`
        fileNames.forEach(function(fileName){
            const fullPath = filePath + "/" + fileName
            if (!Utils.isFolderExists(fullPath)) return {
                result: 0,
                output: "No file on path " + fullPath
            }
            //
            args.push("-F")
            const fileStr = `${fileName}=@${fullPath}`
            args.push(fileStr)
            if(DEBUG) log(fileStr)
        },this)          
        args.push(url)

        return Utils.runCommand(this.curlPath, args)
    }

    runScriptWithArgs(scriptName, args)
    {
        const scriptPath = this.allMockupsdDir + "/" + scriptName
        args.unshift(scriptPath) // add script itself as a first argument
        const res = Utils.runCommand('/bin/bash', args)

        // delete script
        Utils.deleteFile(scriptPath)

        return res
    }

    runToolInResourcesWithArgs(toolName, args)
    {
        var url = this.context.plugin.urlForResourceNamed(toolName).path()
        //args.unshift(toolName)
        //const regex = / /gi;
        //const pathTo = this._getFilePathInResourceFolder(toolName).replace(regex,"\\ ")
        const res = Utils.runCommand(url, args)
        return res
    }

    runToolWithArgs(toolName, args)
    {
        const res = Utils.runCommand(toolName, args)
        return res
    }


    copyScript(scriptName)
    {

        const scriptPath = this.allMockupsdDir + "/" + scriptName

        const fileManager = NSFileManager.defaultManager()
        const targetPath = scriptPath

        // delete old copy
        Utils.deleteFile(targetPath)

        let sourcePath = this._getFileURLInResourceFolder(scriptName)
        let error = MOPointer.alloc().init()

        if (!fileManager.copyItemAtPath_toPath_error(sourcePath, targetPath, error))
        {
            log("copyScript(): Can't copy '" + sourcePath + "' to '" + targetPath + "'. Error: " + error.value().localizedDescription());

            this.UI.alert('Can`t copy script', error.value().localizedDescription())
            return false
        }

        return true
    }

    _initMiro()
    {
        log("_initMiro")
        if (null != this.miroBoards) return true
        // Get request
        log("_initMiro start")
        var response = api.authCheckRequest(this.context);
        if (response)
        {
            if (response.success == 1)
            {
            } else if (response.error && response.error.code == 401)
            {
                api.setToken(nil);
                log(response.error)
                response = null
            } else
            {
                response = null
            }
        }
        if (!response)
        {
            this.UI.alert("Error", "You need to log into Miro using Miro plugin\n\nhttps://github.com/miroapp/sketch_plugin")
            return false
        } else
        {

            this.miroBoards = Utils.getMiroBoardsGroupedByProject()
        }
        return true
    }

    _validateMiroParams()
    {
        if (null == this.miroBoards) return true

        // Find board ID for name
        if ("" == this.miroBoardID && "" != this.miroBoardName)
        {
            let index = this.miroBoards.boards.indexOf(this.miroBoardName)
            if (index >= 0)
            {
                let miroBoardID = this.miroBoards.indexIdsMap[index]
                if (undefined == miroBoardID) miroBoardID = ""
                this.miroBoardID = miroBoardID
            }
        }
        // Find board name for ID
        if ("" != this.miroBoardID && "" == this.miroBoardName)
        {
            let index = this.miroBoards.indexIdsMap.indexOf(this.miroBoardID)
            if (index >= 0)
            {
                let miroBoardName = this.miroBoards.boards[index]
                if (undefined == miroBoardName) miroBoardName = ""
                this.miroBoardName = miroBoardName
            }
        }
        // Reset if something is wrong
        if ("" == this.miroBoardID || "" == this.miroBoardName)
        {
            this.miroBoardID = ""
            this.miroBoardName = ""
        }

        let currentBoardIndex = this.miroBoardID != "" ? this.miroBoards.indexIdsMap.indexOf(this.miroBoardID) : ""
        if (currentBoardIndex < 0) currentBoardIndex = 0
        this.miroBoardIndex = currentBoardIndex

        return true
    }

    _getFileURLInResourceFolder(file)
    {
        return this.context.plugin.url().URLByAppendingPathComponent("Contents").URLByAppendingPathComponent("Sketch").URLByAppendingPathComponent(PublishKeys.RESOURCES_FOLDER).URLByAppendingPathComponent(file)
    }
}
