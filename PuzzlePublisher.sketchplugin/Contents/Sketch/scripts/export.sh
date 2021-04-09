#!/bin/bash

tempDir="$1"
fileName="$2"
docName="$3"
srcSketchPath="/Applications/Sketch.app"
dstSketchPath="${tempDir}/SketchExport.app"
#rm -rf $dstSketchPath
#cp -R $srcSketchPath $dstSketchPath
#echo $dstSketchPath
dstSketchPath = $srcSketchPath
${dstSketchPath}/Contents/Resources/sketchtool/bin/sketchtool --application=SketchExport--new-instance=NO --wait-for-exit=NO --without-waiting=NO --without-activating=YES run ~/Library/Application\ Support/com.bohemiancoding.sketch3/Plugins/PuzzlePublisher.sketchplugin "cmdRun"  --context="{\"file\":\"${fileName}\",\"name\":\"${docName}\",\"commands\":\"export,close\",\"async\":true}"
rm $fileName
kill $(ps -Ac -o pid,comm | awk '/^ *[0-9]+ Sketch$/ {print $1}' | tail -n 1)