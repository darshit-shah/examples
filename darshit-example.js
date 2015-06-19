var express = require('express');
var connect = require('connect');
var childProcess = require('child_process');
var linq = require('linq');
var fs = require('fs');
var app = module.exports = express.createServer();

var MemoryStore = new express.session.MemoryStore();

app.configure(function () {
    app.set('views', __dirname + '/views');
    app.set('view options', { layout: false });
    app.set('view engine', 'jade');
    app.use(express.static(__dirname + '/public'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ store: MemoryStore, secret: 'Th!$!$$@mple', key: 'sid' })); //Th!$!$$@mple
    app.use(function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.header("Access-Control-Allow-Methods", "POST, GET");
        next();
    })
    app.use(connect.compress());
});

app.listen(5001, function () {
    console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
    connectSocket();
});

app.get("/", function (req, res, next) {
    fs.readdir(__dirname + '/public', function (err, files) {
        files = linq.From(files).OrderBy(function (item) { return item; }).ToArray();
        res.render("index", { files: files });
    });
});

function connectSocket() {
    var io = require('socket.io').listen(app, { log: false });
    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file

    // enable all transports (optional if you want flashsocket support, please note that some hosting
    // providers do not allow you to create servers that listen on a port different than 80 or their
    // default port)
    io.set('transports', [
        'websocket'
      , 'flashsocket'
      , 'htmlfile'
      , 'xhr-polling'
      , 'jsonp-polling'
    ]);

    var crossFilter = io
        .of('/crossFilter')
        .on('connection', function (socket) {
            socket.on('connect', function (data) {
                if (socket.mysmartfilter === undefined) {
                    socket.mySmartfilter = childProcess.fork(__dirname + '/smartfilterService.js');
                    socket.mySmartfilter.on("message", function (output) {
                        socket.emit(output.type, output.data);
                    });
                    socket.mySmartfilter.send({ type: "connect", data: data });
                }
                else {
                    socket.emit('errorMessage', 'Setup is one time excercise');
                }
            });
            socket.on('pivot', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "pivot", data: data });
            });
            socket.on('removePivot', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "removePivot", data: data });
            });
            socket.on('filter', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "filter", data: data });
            });
            socket.on('staticFilter', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "staticFilter", data: data });
            });
            socket.on('disconnect', function (data) {
                if (socket.mySmartfilter) {
                    socket.mySmartfilter.send({ type: "disconnect", data: data });
                    socket.mySmartfilter.kill();
                }
            });
            socket.on('data', function (data) {
                if (socket.mySmartfilter)
                    socket.mySmartfilter.send({ type: "data", data: data });
            });
        });

    prepareCanvasGridData(io);
}

function prepareCanvasGridData(io) {
    var colInfo = [];
    var numCols = 50;
    var numRows = 100;
    for (var col = 0; col < numCols; col++) {
        var info = {};
        info.name = 'Column' + (col + 1);
        info.width = 100 + parseInt(Math.random() * 50 * 0);
        if (col % 3 == 0) {
            info.editable = true;
        }
        colInfo.push(info);
        info = null;
    }
    var data = [];

    for (var row = 0; row < numRows; row++) {
        var rowInfo = { height: 24 + parseInt(Math.random() * 40) };
        if (row < 4) {
            rowInfo.height = 40;
        }
        for (var col = 0; col < numCols; col++) {
            rowInfo[colInfo[col].name] = {};
            rowInfo[colInfo[col].name].value = col + '_' + row;
            rowInfo[colInfo[col].name].formatting = {};
            if (col == 0 && row == 0) {
                rowInfo[colInfo[col].name].formatting.rowSpan = 4;
                rowInfo[colInfo[col].name].formatting.colSpan = 1;
                rowInfo[colInfo[col].name].value = 'Date'
            }
            if (col == 1 && row == 0) {
                rowInfo[colInfo[col].name].formatting.rowSpan = 1;
                rowInfo[colInfo[col].name].formatting.colSpan = 15;
                rowInfo[colInfo[col].name].value = 'Plan Dispatch'
                rowInfo[colInfo[col].name].formatting.background = 'yellow';
                rowInfo[colInfo[col].name].formatting.textAlign = 'center';
            }
            if (col == 1 && row == 1) {
                rowInfo[colInfo[col].name].formatting.rowSpan = 1;
                rowInfo[colInfo[col].name].formatting.colSpan = 5;
                rowInfo[colInfo[col].name].value = 'PCW'
            }
            if (col == 6 && row == 1) {
                rowInfo[colInfo[col].name].formatting.rowSpan = 1;
                rowInfo[colInfo[col].name].formatting.colSpan = 5;
                rowInfo[colInfo[col].name].value = 'RCW'
            }
            if (col == 11 && row == 1) {
                rowInfo[colInfo[col].name].formatting.rowSpan = 1;
                rowInfo[colInfo[col].name].formatting.colSpan = 5;
                rowInfo[colInfo[col].name].value = 'GCT'
            }

        }
        data.push(rowInfo);
    }

    var colorCodes = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
    var currentSelections = {};
    var counter = 0;
    var canvasGrid = io.
        of('/canvasGrid')
        .on('connection', function (socket) {
            var key = 'User ' + (counter % colorCodes.length + 1);
            socket.key = key;
            var color = colorCodes[counter % colorCodes.length];
            socket.emit('data', { colInfo: colInfo, data: data, readOnly: false, selectorColor: color, MyKey: key });

            currentSelections[key] = { key: key, color: color, colStart: 1, rowStart: 1, colEnd: 1, rowEnd: 1, selectedEndBox: null, selectedStartBox: null };
            socket.broadcast.emit('addCellSelector', { key: key, data: currentSelections[key] });
            counter++;
            socket.on('updateSelection', function (data) {
                currentSelections[key].colStart = data.colStart;
                currentSelections[key].rowStart = data.rowStart;
                currentSelections[key].colEnd = data.colEnd;
                currentSelections[key].rowEnd = data.rowEnd;
                currentSelections[key].selectedStartBox = data.selectedStartBox;
                currentSelections[key].selectedEndBox = data.selectedEndBox;
                socket.broadcast.emit('updateSelection', currentSelections[key]);
            });
            socket.on('getCurrentSelections', function () {
                var keys = Object.keys(currentSelections);
                for (var i = 0; i < keys.length; i++) {
                    socket.emit('addCellSelector', { key: keys[i], data: currentSelections[keys[i]] });
                }
            });
            socket.on('disconnect', function () {
                socket.broadcast.emit('removeCellSelector', { key: socket.key });
                delete currentSelections[socket.key];
            });
        });

}

process.on('uncaughtException', function (err) {
    console.log('axiom uncaughtException in darshit-example.js', err);
});