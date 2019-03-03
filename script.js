
// CMS API 
//
// 1.Overview
//     every method of this api lives in 'API' namespace so you call them like that:
//     API.some_method();
//     so you can define your own 'some_method()' and there is no collision.
//
// 2.Methods
//   init ()
//      should be called at the before first usage of the API,
//   returns 1 if everything went well or undefined if failed.
//
//   get_file_list ()
//   returns list of paths to all files under $base directory recursively
//           ($base is defined in api.php) or undefined if failed.
//
//   delete_files ( arr )
//      takes JSON array of filepaths 'arr' and deletes them from the server
//   returns  
//...
window.onload = function() {
    document.getElementById("testbutton").onclick = 
        function(){ return function(e){
            API.rename_files(["contents/sell.sc", "contents/main.cpp"], "dupsko");
        } }();
    API.log_output_element = document.getElementById("logger");
    API.file_select_preview_element = document.getElementById("preview");
    document.getElementById("fileselect")
        .addEventListener('change', API.handle_file_select, false);
    document.getElementById("uploadbutton").onclick 
        = function(){ return API.upload_selected_files("contents/");}
    API.init();
}

var API = {
    apiurl : "api.php",

    file_select_quick_upload            : false         ,
    file_select_quick_upload_directory  : "contents/"   ,
    file_select_no_stack_up             : false         ,
    file_select_preview                 : true          ,
    file_select_preview_element         : undefined     ,  
    file_select_preview_css_class       : "thumb"       ,
    file_upload_fail_fast               : false         ,
    file_upload_persist_failed          : false         ,
    file_delete_fail_fast               : false         ,
    file_rename_fail_fast               : false         ,
    file_rename_index_prefix            : ""            ,
    file_rename_index_postfix           : ""            ,
    file_rename_one_no_index            : true          ,
    log_buffer_size                     : 15            ,
    log_buffer_endline                  : "<br>"        ,
    log_output_element                  : undefined     ,
    log_console_output                  : true          ,
    log_element_output                  : true          ,

    log_buffer : undefined,
    log_buffer_iter : 0,
    file_select_buffer : new Array(),

    init : function(){
        var ret = 1;
        var logprefix = "init: ";
        if(!(window.File && window.FileReader && window.FileList && window.Blob)){
            API.err(logprefix+"File APIs are not fully supported in this browser."); ret = undefined;}
        API.log_buffer = new Array(API.log_buffer_size);
        if(API.log_buffer === undefined || API.log_buffer.length !== API.log_buffer_size){
            API.err(logprefix+"Failed to create log_buffer.", true); ret = undefined;}
        if(!(API.log_output_element instanceof Element) && API.log_element_output){
            API.err(logprefix+"log_output_element is not an instance of Element.", true); ret = undefined;}
        if(!(API.file_select_preview_element instanceof Element) && API.file_select_preview){
            API.err(logprefix+"file_preview_element is not an instance of Element.", true); ret = undefined;}
        return ret;
    },
    clear_file_select_buffer : function(){
        file_select_buffer = new Array();
    },
    handle_file_select : function(e){
        if(API.file_select_no_stack_up){API.clear_file_select_buffer();}
        API.file_select_buffer.push.apply(API.file_select_buffer, e.target.files);
        if(API.file_select_preview){ API.update_file_select_preview();}
        if(API.file_select_quick_upload){API.upload_selected_files(API.file_select_quick_upload_directory);}
    },
    update_file_select_preview(){
        if(API.file_select_preview_element instanceof Element){
            API.file_select_preview_element.innerHTML = "";
            for(let i=0, f; f=API.file_select_buffer[i]; i++){
                if(!f.type.match('image.*')){ continue; }
                var reader = new FileReader();
                reader.onload = (function(file){
                    return function(e){
                        var span = document.createElement('span');
                        span.innerHTML = ['<img class="',API.file_select_preview_css_class,
                            '" src="', e.target.result, '"title="', escape(file.name), '"/>,'].join('');
                        API.file_select_preview_element.insertBefore(span, null);
                    }
                })(f);
                reader.readAsDataURL(f);
            }
        }else{
            API.err("file_preview_element is not an instance of Element.");
        }
    },
    get_file_list: function(){ 
        return API._request('GET',API.apiurl,null, true, "get_file_list failed"); 
    },
    upload_selected_files(path){ // TODO: async
        var logprefix = "upload_selected_files(path): ";
        var omitted = 0;
        var total = API.file_select_buffer.length;
        if(path === undefined){ API.err(logprefix+"path is not specified."); return undefined; } 
        while(API.file_select_buffer.length > omitted){
            var form_data = new FormData();
            form_data.append('file', API.file_select_buffer[omitted]);
            form_data.append('path', path);
            var ret = API._request
                ('POST',API.apiurl,form_data, true,
                    logprefix + "uploading " + API.file_select_buffer[omitted].name + " failed"); 
            var failed = (ret === undefined || ret != 0);
            if(ret === undefined){ API.err( logprefix + "uploading "+ API.file_select_buffer[omitted].name +" failed"); }
            else if(ret.error != 0){ API.err( logprefix + "SERVER: "+ ret.err_msg); }
            else{ API.log(logprefix + "SERVER: "+ ret.err_msg); }

            if(API.file_upload_fail_fast && failed){return undefined;}
            if(API.file_upload_persist_failed && failed){ omitted+=1; continue;}
            API.file_select_buffer.splice(omitted, 1);
            if(API.file_select_preview){ API.update_file_select_preview();}
        }
        API.log(logprefix+"uploaded " + (total-omitted) + " of " + total)
        return (total - omitted);
    },
    delete_files : function(arr){ 
        var logprefix = "delete_files(arr): ";
        if(!Array.isArray(arr)){ API.err(logprefix+ "arr is not an array."); return undefined;}
        var omitted = 0;
        var total = arr.length;
        var iter = 0;
        while(iter < total){
            var ret = API._request('DELETE',API.apiurl,arr[iter], true, logprefix + "failed"); 
            var failed = (ret === undefined || ret != 0);
            if(ret === undefined){ API.err( logprefix + "deleting "+ arr[iter] +" failed"); }
            else if(ret.error != 0){ API.err( logprefix + "SERVER: "+ ret.err_msg); }
            else{ API.log(logprefix + "SERVER: "+ ret.err_msg); }
            if(API.file_delete_fail_fast && failed){return undefined;}
            iter++;
        }
        return (total - omitted);
    },
    rename_files : function(arr, name){
        var logprefix = "rename_files(arr,name): ";
        if(!Array.isArray(arr)){ API.err(logprefix+ "arr is not an array."); return undefined;}
        var omitted = 0;
        var total = arr.length;
        var iter = 0;
        while(iter < total){
            var params = {"name":name + API.file_rename_index_prefix + 
                iter + API.file_rename_index_postfix, "path":arr[iter] }
            if(arr.length == 1 && file_rename_one_no_index){params.name = name;}
            var ret = API._request('PUT',API.apiurl,JSON.stringify(params), true, logprefix + "failed"); 
            var failed = (ret === undefined || ret != 0);
            if(ret === undefined){ API.err( logprefix + "renaming "+ arr[iter] +" failed"); }
            else if(ret.error != 0){ API.err( logprefix + "SERVER: "+ ret.err_msg); }
            else{ API.log(logprefix + "SERVER: "+ ret.err_msg); }
            if(API.file_rename_fail_fast && failed){return undefined;}
            iter++;
        }
        return (total - omitted);
    },
    _request : function
        (method, url, params, json_output=false, err_message="request error"){
        var ret;
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, false);
        xhr.onreadystatechange = function() {
            if(xhr.readyState === 4){
                if(xhr.status === 200 || xhr.status == 0){
                    ret = xhr.responseText;
                }
            }
        }
        xhr.send(params);
        if(ret === undefined){ API.err(err_message); return undefined;}
        else{ return (json_output) ? JSON.parse(ret) : ret; }
    },
    log_output : function(){
        var logprefix = "log_output: ";
        if(API.log_output_element instanceof Element){
            API.log_output_element.innerHTML = "";
            for(    let i=API.log_buffer_iter;
                    i != Math.abs((API.log_buffer_iter-1)%API.log_buffer_size) ;
                    i=(i+1)%API.log_buffer_size){
                if(API.log_buffer[i] != undefined){
                    API.log_output_element.innerHTML += API.log_buffer[i];
                }
            }
        }else{ 
            API.err(logprefix + "log_output_element is not an instance of Element.", true);
            API.log()
        }
    },
    log : function(info, force_console = false){
        var msg = "[" + new Date().toLocaleString() + "] " + info;
        API.log_buffer[API.log_buffer_iter++] = msg + API.log_buffer_endline;
        API.log_buffer_iter %= API.log_buffer_size;
        //TODO:move to log_output
        if(force_console || API.log_console_output){ console.log(msg); }
        if(!force_console && API.log_element_output){ API.log_output();}
    },
    err : function(info, force_console = false){ API.log(info, force_console);}
}
