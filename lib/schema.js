var mg = require("mongoose");

var Session, User, Item, MDRecord, Query,
    Schema = mg.Schema,
    Mixed = Schema.Types.Mixed;

var def_metadata_sch = new Schema({
    dkclarinID: {
        type: String,
        required: true
    },
    type: {
        name: {
            type: String,
            required: true
        }
    },
    data: {
        type: Mixed
    },
    status: {
        updated: {
            type: Boolean,
            default: false
        },
        completed: {
            type: Boolean,
            default: false
        },
        lastUpdatedDate: {
            type: Date
        },
        completedDate: {
            type: Date
        }
    }
});
var def_query_sch = new Schema({
    _session: {
        type: Schema.ObjectId,
        ref: "Session",
        required: true
    },
    search_path: {
        type: String
    },
    search_ids: [String],
    result_collection: [{
        type: Schema.ObjectId,
        ref: "MDRecord"
    }],
    status: {
        updated: {
            type: Boolean,
            default: false
        },
        completed: {
            type: Boolean,
            default: false
        },
        lastUpdatedDate: {
            type: Date
        },
        completedDate: {
            type: Date
        }
    }
});
var def_user_sch = new Schema({
    handle: {
        type: String,
        required: true
    },
    fullname: {
        type: String
    },
    email: {
        type: String
    }
});
def_user_sch.method('userHandleToBase64', function() {
    return new Buffer(this.handle).toString("base64");
});

User = mg.model('User', def_user_sch);
var def_session_sch = new Schema({
    created_on: {
        type: Date,
        default: Date.now
    },
    expires_on: {
        type: Date
    }, //TODO Set expiration based on handle
    //completed: {type: Boolean}, // Comment: Do we need to complete sessions or just expire?
    users: [User.schema]
});

def_session_sch.static('findByHandle', function(handle, callback) {
    return this.findOne({
        "users.handle": handle
    }, callback);
});

// def operation + operation_onitem schemas

var SessionModel = function() {
    Session = mg.model('Session', def_session_sch);
    return Session;
}

var QueryModel = function() {
    def_query_sch.virtual('update')
        .get(function() {
            return this.status.updated;
        })
        .set(function(v) {
            if (v) {
                this.set('status.updated', v);
                this.set('status.lastUpdatedDate', new Date());
            }
        });
    def_query_sch.virtual('complete')
        .get(function() {
            return this.status.completed;
        })
        .set(function(v) {
            if (v) {
                this.set('status.completed', v);
                this.set('status.completedDate', new Date());
            }
        });
    def_query_sch.virtual('results.count').get(function() {
        return this.result_collection.length;
    });
    def_query_sch.virtual('sessionId').get(function() {
        return this._session;
    });
    Query = mg.model('Query', def_query_sch);
    return Query;
}

var MDRecordModel = function() {
    def_metadata_sch.virtual('update')
        .get(function() {
            return this.status.updated;
        })
        .set(function(v) {
            if (v) {
                this.set('status.updated', v);
                this.set('status.lastUpdatedDate', new Date());
            }
        });
    def_metadata_sch.virtual('complete')
        .get(function() {
            return this.status.completed;
        })
        .set(function(v) {
            if (v) {
                this.set('status.completed', v);
                this.set('status.completedDate', new Date());
            }
        });

    MDRecord = mg.model('MDRecord', def_metadata_sch);
    return MDRecord;
}

var CreateSession = function(options) {
    return new Session(options);
}

var CreateQuery = function(options) {
    return new Query(options);
}

var CreateMDRecord = function(options) {
    return new MDRecord(options);
}

var models = {
    Session: SessionModel(),
    Query: QueryModel(),
    MDRecord: MDRecordModel()
}

var types = {
    ObjectId: mg.Types.ObjectId,
    SchemaTypes: Schema.Types
}

module.exports = {
    CreateSession: CreateSession,
    CreateQuery: CreateQuery,
    CreateMDRecord: CreateMDRecord,
    models: models,
    types: types
}
