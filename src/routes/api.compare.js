var express = require('express');
var router = express.Router();

var devAccount = require("./../config").devAccount;
var endpoints = require("../bin/aerohive/api/main");
var Device = require("../bin/aerohive/models/device");
var Location = require("../bin/aerohive/models/location");

/*================================================================
 COMMON FUNCTIONS
 ================================================================*/
function locationsFromQuery(req) {
    // if the "locations" parameter exists, and is not null, will filter the request based on the locations selected by the user
    // otherwise takes the "root" folder
    if (req.query.locations && req.query.locations.length > 0) {
        locations = req.query.locations;
        if (locations.length == 0) locations = [req.session.locations.id];
    } else locations = [req.session.locations.id];
    if (typeof locations == "number" || typeof locations == "string") locations = [locations];
    return locations;
}

/*================================================================
 ROUTES
 ================================================================*/

/*================================================================
 API - PER LOCATION COMPARISON
 ================================================================*/
router.get('/locations/global', function (req, res, next) {
    var currentApi = req.session.xapi.owners[req.session.xapi.ownerIndex];

    var startTime, endTime, locations, locDone, averageDone, numLoc, polarReq;
    var locResult = [];
    var dataAverage = [];
    var errors = [];
    if (req.query.startTime && req.query.endTime) {
        // retrieve the start time and end time from the POST method
        startTime = new Date(req.query.startTime);
        endTime = new Date(req.query.endTime);

        // if the "locations" parameter exists, and is not null, will filter the request based on the locations selected by the user
        // otherwise takes the "root" folder
        locations = locationsFromQuery(req);
        // Only take into account the type of locations defined by the user
        if (req.query.locationFilter) {
            switch (req.query.locationFilter) {
                case "GENERIC":
                    numLoc = req.session.locationsCount.folder;
                    break;
                case "BUILDING":
                    numLoc = req.session.locationsCount.building;
                    break;
                case "FLOOR":
                    numLoc = req.session.locationsCount.floor;
                    break;
            }
        }

        locDone = 0;
        averageDone = false;

        locations.forEach(function (location) {
            // for each location get the number of clients for each location
            // once done, will go to the Event "compare location polar location" below
            endpoints.clientlocation.clientcount.GET(
                currentApi,
                devAccount,
                location,
                startTime.toISOString(),
                endTime.toISOString(),
                function (err, data) {
                    if (err) errors.push(err);
                    else {
                        // get the name of the location based on the locationID
                        var name = Location.getLocationName(req.session.locations, location);
                        var result = {
                            "locationId": location,
                            "serie": name,
                            "uniqueClients": data.uniqueClients,
                            "engagedClients": data.engagedClients,
                            "passersbyClients": data.passersbyClients,
                            "associatedClients": data.associatedClients,
                            "unassociatedClients": data.unassociatedClients,
                            "newClients": data.newClients,
                            "returningClients": data.returningClients
                        };
                        // store the result
                        locResult.push(result);
                        locDone++;
                    }
                    // got to the event "compare location polar finished"
                    end();
                }
            );
        });
        // get the number of clients for the NG account. This will be used to get the average number of clients
        // once done, will go to the Event "compare location polar average" below
        endpoints.clientlocation.clientcount.GET(
            currentApi,
            devAccount,
            req.session.locations.id,
            startTime.toISOString(),
            endTime.toISOString(),
            function (err, data) {
                // if there is an error: send the error message to the web browser
                if (err) errors.push(err);
                else {
                    // for each number, divided it by the number of locations to get the average
                    dataAverage = {
                        uniqueClients: parseInt((data.uniqueClients / numLoc).toFixed(0)),
                        engagedClients: parseInt((data.engagedClients / numLoc).toFixed(0)),
                        passersbyClients: parseInt((data.passersbyClients / numLoc).toFixed(0)),
                        associatedClients: parseInt((data.associatedClients / numLoc).toFixed(0)),
                        unassociatedClients: parseInt((data.unassociatedClients / numLoc).toFixed(0)),
                        newClients: parseInt((data.newClients / numLoc).toFixed(0)),
                        returningClients: parseInt((data.returningClients / numLoc).toFixed(0))

                    };
                    averageDone = true;
                }
                // got to the event "compare location poloar finished"
                end();
            }
        );


        var end = function() {
            // check if all locations are done, and if the average is done
            if (locDone == locations.length && averageDone) {
                if (errors.length > 0) res.status(500).json({
                    errors: errors
                });
                // send back the response to the web browser
                else res.json({
                    data: locResult,
                    average: dataAverage
                });
            }
        };
    }
});

// route to get the "Over Time" charts
router.get('/locations/timeline', function (req, res, next) {
    var currentApi = req.session.xapi.owners[req.session.xapi.ownerIndex];

    var startTime, endTime, timeUnit, location, locations, locDone;
    var series = [];
    var timeserie = [];
    var errors = [];
    if (req.query.startTime && req.query.endTime) {
        // retrieve the start time and end time from the POST method
        startTime = new Date(req.query.startTime);
        endTime = new Date(req.query.endTime);

        // set the TimeUnit depending on the duration to fit the ACS API constraints
        if (endTime - startTime <= 172800000) {
            timeUnit = "FiveMinutes";
        } else if (endTime - startTime <= 604800000) {
            timeUnit = "OneHour";
        } else {
            timeUnit = "OneDay";
        }


        // if the "locations" parameter exists, and is not null, will filter the request based on the locations selected by the user
        // otherwise takes the "root" folder
        locations = locationsFromQuery(req);

        locDone = 0;


        locations.forEach(function (location) {
            // for each location get the number of clients for each location
            // once done, will go to the Event "compare location timeline" below
            endpoints.clientlocation.clienttimeseries.GET(
                currentApi,
                devAccount,
                location,
                startTime.toISOString(),
                endTime.toISOString(),
                timeUnit,
                function (err, data) {
                    // if there is an error, send the error message to the web browser
                    if (err) errors.push(err);
                    else {
                        var storeFrontClients, name;
                        // get the name of the location based on the locationID
                        name = Location.getLocationName(req.session.locations, location);
                        data.times.forEach(function (currentData) {
                            // for each "time" entry, calculate the storefront conversion
                            if (currentData.uniqueClients == 0) storeFrontClients = 0;
                            else storeFrontClients = ((currentData.engagedClients / currentData.uniqueClients) * 100).toFixed(0);
                            // add the storefront conversion the the entry
                            currentData.storefrontClients = parseInt(storeFrontClients);
                        });
                        // create an array with all the time values (used for the xAxis on the charts)
                        if (timeserie.length == 0) {
                            data.times.forEach(function (entry) {
                                timeserie.push(entry.time);
                            });
                        }
                        //timeserie = data.times["time"];
                        // add the array of values from this location to the final array
                        series.push({
                            name: name,
                            data: data.times
                        });
                        locDone++;
                    }
                    // call the "compare location timeline finished" event
                    end();
                });

            function end() {
                // if all the locations are done, send back the response to the web browser
                if (locDone == locations.length) {
                    if (errors.length > 0) res.status(500).json({
                        errors: errors
                    });
                    else res.json({
                        timeserie: timeserie,
                        series: series
                    });
                }
            }
        });
    } else res.status(500).json({
        error: "missing parameters"
    });
});

/*================================================================
 API - PER PERIOD COMPARISON
 ================================================================*/
// route to get the "Global" charts
router.get("/periods/global", function (req, res, next) {
    var currentApi = req.session.xapi.owners[req.session.xapi.ownerIndex];

    var oneHour, oneDay, oneWeek, oneMonth, range, reqPeriods, i;
    var startTime, endTime, locations;
    var errors = [];
    if (req.query.startTime && req.query.endTime) {
        // retrieve the start time and end time from the POST method
        startTime = new Date(req.query.startTime);
        endTime = new Date(req.query.endTime);
        range = endTime - startTime;

        // if the "locations" parameter exists, and is not null, will filter the request based on the locations selected by the user
        // otherwise takes the "root" folder
        locations = locationsFromQuery(req);

        oneHour = 1000 * 60 * 60;
        oneDay = oneHour * 24;
        oneWeek = oneDay * 7;
        oneMonth = oneDay * 31;

        // define the array of periods to compare.
        // The number of entries and the values of each of them depends on the time range
        // if the time range is less than one day
        if (range <= oneDay) {
            reqPeriods = [{
                "serie": 'Today',
                "start": startTime,
                "end": endTime,
                "uniqueClients": 0,
                "engagedClients": 0,
                "passersbyClients": 0,
                "associatedClients": 0,
                "unassociatedClients": 0,
                "newClients": 0,
                "returningClients": 0
            }];
            for (i = 1; i <= 7; i++) {
                // calculate the start/end dates (initial -1 day, -2 days, ...)
                var startDay = new Date(startTime);
                startDay.setDate(startDay.getDate() - i);
                var endDay = new Date(endTime);
                endDay.setDate(endDay.getDate() - i);
                // add the new period at the beginning of the array
                reqPeriods.unshift({
                    "serie": 'Day -' + i,
                    start: startDay,
                    end: endDay,
                    "uniqueClients": 0,
                    "engagedClients": 0,
                    "passersbyClients": 0,
                    "associatedClients": 0,
                    "unassociatedClients": 0,
                    "newClients": 0,
                    "returningClients": 0
                });
            }
        }
        // if the time range is less than one week
        // same as before, but range difference is 1 week
        else if (range <= oneWeek) {
            reqPeriods = [{
                "serie": 'This Week',
                start: startTime,
                end: endTime,
                "uniqueClients": 0,
                "engagedClients": 0,
                "passersbyClients": 0,
                "associatedClients": 0,
                "unassociatedClients": 0,
                "newClients": 0,
                "returningClients": 0
            }];
            for (i = 1; i <= 5; i++) {
                var startWeek = new Date(startTime);
                startWeek.setDate(startWeek.getDate() - i * 7);
                var endWeek = new Date(endTime);
                endWeek.setDate(endWeek.getDate() - i * 7);
                reqPeriods.unshift({
                    "serie": 'Week -' + i,
                    start: startWeek,
                    end: endWeek,
                    "uniqueClients": 0,
                    "engagedClients": 0,
                    "passersbyClients": 0,
                    "associatedClients": 0,
                    "unassociatedClients": 0,
                    "newClients": 0,
                    "returningClients": 0
                });
            }
        }
        // if the time range is less than one month
        // same as before, but range difference is 1 month
        else if (range <= oneMonth) {
            reqPeriods = [{
                "serie": 'This Month',
                start: startTime,
                end: endTime,
                "uniqueClients": 0,
                "engagedClients": 0,
                "passersbyClients": 0,
                "associatedClients": 0,
                "unassociatedClients": 0,
                "newClients": 0,
                "returningClients": 0
            }];
            for (i = 1; i <= 6; i++) {
                var startMonth = new Date(startTime);
                startMonth.setMonth(startMonth.getMonth() - i);
                var endMonth = new Date(endTime);
                endMonth.setMonth(endMonth.getMonth() - i);
                reqPeriods.unshift({
                    "serie": 'Month -' + i,
                    start: startMonth,
                    end: endMonth,
                    "uniqueClients": 0,
                    "engagedClients": 0,
                    "passersbyClients": 0,
                    "associatedClients": 0,
                    "unassociatedClients": 0,
                    "newClients": 0,
                    "returningClients": 0
                });
            }
        }
        // otherwise
        // same as before, but range difference is 1 year
        else {
            reqPeriods = [{
                "serie": 'This Year',
                start: startTime,
                end: endTime,
                "uniqueClients": 0,
                "engagedClients": 0,
                "passersbyClients": 0,
                "associatedClients": 0,
                "unassociatedClients": 0,
                "newClients": 0,
                "returningClients": 0
            }];
            for (i = 1; i <= 2; i++) {
                var startYear = new Date(startTime);
                startYear.setFullYear(startYear.getFullYear() - i);
                var endYear = new Date(endTime);
                endYear.setFullYear(endYear.getFullYear() - i);
                reqPeriods.unshift({
                    "serie": 'Year -' + i,
                    start: startYear,
                    end: endYear,
                    "uniqueClients": 0,
                    "engagedClients": 0,
                    "passersbyClients": 0,
                    "associatedClients": 0,
                    "unassociatedClients": 0,
                    "newClients": 0,
                    "returningClients": 0
                });
            }
        }

        var reqDone = 0;
        // calculate the total number of ACS API calls we have to do.
        // this will be used to validate that all the requests are done
        var reqTotal = locations.length * reqPeriods.length;

        locations.forEach(function (location) {
            // loop over all the locations selected
            reqPeriods.forEach(function (currentPeriod) {
                // loop over all the period defined above (number of periods is depending on the time range)
                endpoints.clientlocation.clientcount.GET(
                    currentApi,
                    devAccount,
                    location,
                    currentPeriod.start.toISOString(),
                    currentPeriod.end.toISOString(),
                    function (err, result) {
                        // if there is an error, send the error message to the web browser
                        if (err) errors.push(err);
                        else {
                            // add the values from this location to the value for this period of time
                            // the result is, for each period of time, the number of clients over all the selected locations
                            this.currentPeriod.uniqueClients += result.uniqueClients;
                            this.currentPeriod.engagedClients += result.engagedClients;
                            this.currentPeriod.passersbyClients += result.passersbyClients;
                            this.currentPeriod.associatedClients += result.associatedClients;
                            this.currentPeriod.unassociatedClients += result.unassociatedClients;
                            this.currentPeriod.newClients += result.newClients;
                            this.currentPeriod.returningClients += result.returningClients;
                            reqDone++;
                            // if all the locations and the periods are done
                            if (reqDone == reqTotal) {
                                if (errors.length > 0) res.status(500).json({
                                    errors: errors
                                });
                                else {
                                    var dataAverage = {
                                        "uniqueClients": 0,
                                        "engagedClients": 0,
                                        "passersbyClients": 0,
                                        "associatedClients": 0,
                                        "unassociatedClients": 0,
                                        "newClients": 0,
                                        "returningClients": 0
                                    };
                                    // calculate the average over all the periods
                                    reqPeriods.forEach(function (resultPeriod) {
                                        dataAverage.uniqueClients += resultPeriod.uniqueClients;
                                        dataAverage.engagedClients += resultPeriod.engagedClients;
                                        dataAverage.passersbyClients += resultPeriod.passersbyClients;
                                        dataAverage.associatedClients += resultPeriod.associatedClients;
                                        dataAverage.unassociatedClients += resultPeriod.unassociatedClients;
                                        dataAverage.newClients += resultPeriod.newClients;
                                        dataAverage.returningClients += resultPeriod.returningClients;
                                    });
                                    dataAverage.uniqueClients = parseInt((dataAverage.uniqueClients / reqPeriods.length).toFixed(0));
                                    dataAverage.engagedClients = parseInt((dataAverage.engagedClients / reqPeriods.length).toFixed(0));
                                    dataAverage.passersbyClients = parseInt((dataAverage.passersbyClients / reqPeriods.length).toFixed(0));
                                    dataAverage.associatedClients = parseInt((dataAverage.associatedClients / reqPeriods.length).toFixed(0));
                                    dataAverage.unassociatedClients = parseInt((dataAverage.unassociatedClients / reqPeriods.length).toFixed(0));
                                    dataAverage.newClients = parseInt((dataAverage.newClients / reqPeriods.length).toFixed(0));
                                    dataAverage.returningClients = parseInt((dataAverage.returningClients / reqPeriods.length).toFixed(0));
                                    // send back the response to the web browser
                                    res.json({
                                        average: dataAverage,
                                        data: reqPeriods
                                    });
                                }
                            }
                        }
                    }.bind({
                        currentPeriod: currentPeriod
                    }));
            });
        });
    } else
        res.status(500).json({
            error: "missing parameters"
        });
});

// route to get the "Over Time" charts
router.get('/periods/timeline', function (req, res, next) {
    var currentApi = req.session.xapi.owners[req.session.xapi.ownerIndex];

    var oneHour, oneDay, oneWeek, oneMonth, range, series, i;
    var startTime, endTime, timeUnit, locations;
    var timeserie = [];
    var errors = [];

    if (req.query.startTime && req.query.endTime) {
        // retrieve the start time and end time from the POST method
        startTime = new Date(req.query.startTime);
        endTime = new Date(req.query.endTime);
        range = endTime - startTime;

        // set the TimeUnit depending on the duration to fit the ACS API constraints
        if (range <= 172800000) {
            timeUnit = "FiveMinutes";
        } else if (range <= 604800000) {
            timeUnit = "OneHour";
        } else {
            timeUnit = "OneDay";
        }



        // if the "locations" parameter exists, and is not null, will filter the request based on the locations selected by the user
        // otherwise takes the "root" folder
        locations = locationsFromQuery(req);

        oneHour = 1000 * 60 * 60;
        oneDay = oneHour * 24;
        oneWeek = oneDay * 7;
        oneMonth = oneDay * 31;

        // define the array of periods to compare.
        // The number of entries and the values of each of them depends on the time range
        // if the time range is less than one day
        if (range <= oneDay) {
            series = [{
                name: 'Today',
                start: startTime,
                end: endTime,
                data: null
            }];
            for (i = 1; i <= 7; i++) {
                var startDay = new Date(startTime);
                startDay.setDate(startDay.getDate() - i);
                var endDay = new Date(endTime);
                endDay.setDate(endDay.getDate() - i);
                series.unshift({
                    name: 'Day -' + i,
                    start: startDay,
                    end: endDay,
                    data: null
                });
            }
        }
        // define the array of periods to compare.
        // same as above, but range difference is 1 week
        else if (range <= oneWeek) {
            series = [{
                name: 'This Week',
                start: startTime,
                end: endTime,
                data: null
            }];
            for (i = 1; i <= 4; i++) {
                var startWeek = new Date(startTime);
                startWeek.setDate(startWeek.getDate() - i * 7);
                var endWeek = new Date(endTime);
                endWeek.setDate(endWeek.getDate() - i * 7);
                series.unshift({
                    name: 'Week -' + i,
                    start: startWeek,
                    end: endWeek,
                    data: null
                });
            }
        }
        // define the array of periods to compare.
        // but range difference is 1 month
        else if (range <= oneMonth) {
            series = [{
                name: 'This Month',
                start: startTime,
                end: endTime,
                data: null
            }];
            for (i = 1; i <= 2; i++) {
                var startMonth = new Date(startTime);
                startMonth.setMonth(startMonth.getMonth() - i);
                var endMonth = new Date(endTime);
                endMonth.setMonth(endMonth.getMonth() - i);
                series.unshift({
                    name: 'Month -' + i,
                    start: startMonth,
                    end: endMonth,
                    data: null
                });
            }
        }
        // define the array of periods to compare.
        // same as above, but range difference is 1 year
        else {
            series = [{
                name: 'This Year',
                start: startTime,
                end: endTime,
                data: null
            }];
            for (i = 1; i <= 2; i++) {
                var startYear = new Date(startTime);
                startYear.setFullYear(startYear.getFullYear() - i);
                var endYear = new Date(endTime);
                endYear.setFullYear(endYear.getFullYear() - i);
                series.unshift({
                    name: 'Month -' + i,
                    start: startYear,
                    end: endYear,
                    data: null
                });
            }
        }

        var reqDone = 0;
        // calculate the total number of ACS API calls we have to do.
        // this will be used to validate that all the requests are done
        var reqTotal = locations.length * series.length;

        locations.forEach(function (location) {
            // loop over all the selected locations
            series.forEach(function (currentPeriod) {
                // loop over all the defined periods
                endpoints.clientlocation.clienttimeseries.GET(
                    currentApi,
                    devAccount,
                    location,
                    currentPeriod.start.toISOString(),
                    currentPeriod.end.toISOString(),
                    timeUnit,
                    function (err, data) {
                        // if there is an error, send the error message to the web browser
                        if (err) console.log(err); //errors.push(err);
                        else {
                            // if it is the first location done for this period of time, set the values
                            if (this.currentPeriod.data == null) this.currentPeriod.data = data.times;
                            // otherwise add the new values to the values from the previous location
                            else {
                                for (var k = 0; k < data.times.length; k++) {
                                    this.currentPeriod.data[k].uniqueClients += data.times[k].uniqueClients;
                                    this.currentPeriod.data[k].engagedClients += data.times[k].engagedClients;
                                    this.currentPeriod.data[k].passersbyClients += data.times[k].passersbyClients;
                                    this.currentPeriod.data[k].associatedClients += data.times[k].associatedClients;
                                    this.currentPeriod.data[k].unassociatedClients += data.times[k].unassociatedClients;
                                    this.currentPeriod.data[k].newClients += data.times[k].newClients;
                                    this.currentPeriod.data[k].returningClients += data.times[k].returningClients;
                                }
                            }
                            reqDone++;
                            // if all the periods and all the locations are done
                            if (reqDone == reqTotal) {
                                if (errors.length > 0) res.status(500).json({
                                    errors: errors
                                });
                                else {
                                    var storeFrontClients;
                                    series.forEach(function (currentPeriod) {
                                        currentPeriod.data.forEach(function (currentData) {
                                            // generate the "timeserie" array for the xAxis
                                            timeserie.push(currentData.time);
                                            // calculate and add the storefront conversion to the entry
                                            if (currentData.uniqueClients == 0) storeFrontClients = 0;
                                            else storeFrontClients = ((currentData.engagedClients / currentData.uniqueClients) * 100).toFixed(0);
                                            currentData.storefrontClients = parseInt(storeFrontClients);
                                        });
                                    });
                                    // send back the response to the web browser
                                    res.json({
                                        timeserie: timeserie,
                                        series: series
                                    });
                                }
                            }
                        }
                    }.bind({
                        currentPeriod: currentPeriod
                    }));
            });
        });
    } else res.json({
        error: "missing parameters"
    });
});
module.exports = router;