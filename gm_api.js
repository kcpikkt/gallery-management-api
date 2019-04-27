// gallery management api

/*
==================================================================================================================================
 1.Overview
     every method of this api lives in 'gm_api' namespace so you call them like that:
     gm_api.some_method();
     so you can define your own 'some_method()' and there is no collision.

==================================================================================================================================
 2.Methods
   NOTE: every parameter of every method is mandatory.
   NOTE: behaviour of some methods change depending on global variables,
         make sure to set them before you use the api.

--------------------------------------------------------------------------------------------------------------------------------
   init ()
      Should be called at the start, before using this gm_api,
      i.e. you should first set global variables, connect DOM elements and such
      and then call gm_api.init() once. Force all of its log output onto the console.

      returns 0 if everything went well

--------------------------------------------------------------------------------------------------------------------------------
   get_file_tree (path)
      returns tree of all files under $base directory as JSON array.
              File is represented by simple JSON object with name and array of its children:
              { "name":"filename" , "children":[...] }
              Tree starts with an array containing root object which represents $base directory on the server.

--------------------------------------------------------------------------------------------------------------------------------
   get_file_list ()
      returns list of paths to all files under $base directory recursively
              as JSON array or undefined if failed ($base is defined in api.php).

--------------------------------------------------------------------------------------------------------------------------------
   delete_files ( arr )
      takes JSON array of paths to files - 'arr' and deletes them from the server.

      returns  

--------------------------------------------------------------------------------------------------------------------------------
   delete_directories ( arr )
      takes JSON array of paths to directories - 'arr' and deletes them and their contents recursively from the server.

      returns  

--------------------------------------------------------------------------------------------------------------------------------
   create_directories ( arr )
      takes JSON array of paths and creates specified directories

      returns  
--------------------------------------------------------------------------------------------------------------------------------
   rename_files ( arr , name )
      takes JSON array of paths to files - 'arr' and renames them to 'name'+'index'
      where 'index' is exactly the same as index of a given filepath in 'arr'.
      file_rename_index_prefix and file_rename_index_postfix can be specified to
      have files named in form of e.g. 'name'_('index').

      returns number of files successfully renamed or undefined if failed.

--------------------------------------------------------------------------------------------------------------------------------
   handle_file_select ( e )
      Takes event 'e' and adds e.target.files to the file_select_buffer.
      Should be used with DOM file browser element like in example below.

      returns nothing.

      example usage:
          <div type="file" id="fileselect" accept="image/*" multiple/>
          <script>
              document.getElementById( "fileselect" )
                  .addEventListener( "onchange" , gm_api.handle_file_select , false )
          </script>

--------------------------------------------------------------------------------------------------------------------------------
  clear_file_select_buffer ()
      simply clears selected files buffer.

      returns nothing.

--------------------------------------------------------------------------------------------------------------------------------
  TODO: this method may need to execute asynchronously for large files, add async support.
  upload_selected_files ( path ) 
      uploads files stored currenly in file_select_buffer to the server 
      at location specified in 'path'. If a given file is uploaded successfully its automatically
      deleted from file_select buffer

      returns number of files successfully uploaded or undefined if failed.

--------------------------------------------------------------------------------------------------------------------------------
*/

var gm_api = {
/*
==================================================================================================================================
  3.Variables
  NOTE: Its bad practice to change them directly in code. Instead do
        gm_api.variable_name = value;

*/
    apiurl : "api.php",                                     // url to corresponding backend side of this api
//------------------------------------------------------------------------------------------------------------------------------
    file_select_quick_upload            : false         ,   // If true, uploads files right after handling selection.
    file_select_quick_upload_directory  : "contents/"   ,   // Directory for quick upload.
    file_select_no_stack_up             : false         ,   // If true, file_select_buffer is cleared before every new selection.
    file_select_preview                 : false         ,   // If true, selected files thumbnails are handled.
    file_select_preview_element         : undefined     ,   // DOM element in which thumbnails ought to be shown.
    file_select_preview_css_class       : "thumb"       ,   // CSS class given by default to every thumbnail.

//------------------------------------------------------------------------------------------------------------------------------
    file_upload_fail_fast               : false         ,   // Stop uploading files immediately after one fails.
    file_upload_persist_failed          : true          ,   // Keep files that failed to upload in file_select_buffer

//------------------------------------------------------------------------------------------------------------------------------
    file_delete_fail_fast               : false         ,   // Stop deleting files immediately after one fails.

//------------------------------------------------------------------------------------------------------------------------------
    file_rename_fail_fast               : false         ,   // Stop renaming files immediately after one fails.
    file_rename_index_prefix            : "("           ,   // Put before index when renaming files.
    file_rename_index_postfix           : ")"           ,   // Put after index when renaming files.
    file_rename_one_no_index            : true          ,   // If true, Omit index when renaming only one file.
//------------------------------------------------------------------------------------------------------------------------------
    create_directories_fail_fast          : false         ,   // Stop creating directories immediately after one fails.

//------------------------------------------------------------------------------------------------------------------------------
    log_console_output                  : true          ,   // If true, outputs all logs to the browser console
    log_element_output                  : false         ,   // If true, outputs all logs to the specified DOM element
    log_output_element                  : undefined     ,   // DOM element in which logs ought to be shown.
    log_buffer_size                     : 15            ,   // Log buffer size in lines.
    log_buffer_endline                  : "<br>"        ,   // Put after every log shown in DOM

//------------------------------------------------------------------------------------------------------------------------------
//========================================================================================== max 130 characters wide =============


    log_buffer : undefined,
    log_buffer_iter : 0,
    file_select_buffer : new Array(),

    init : function(){
        var ret = 0;
        if(!(window.File && window.FileReader && window.FileList && window.Blob)){
            gm_api.err("File gm_apis are not fully supported in this browser."); ret = 1;}
        gm_api.log_buffer = new Array(gm_api.log_buffer_size);
        if(gm_api.log_buffer === undefined || gm_api.log_buffer.length !== gm_api.log_buffer_size){
            gm_api.err("Failed to create log_buffer.", true); ret = 2;}
        if(!(gm_api.log_output_element instanceof Element) && gm_api.log_element_output){
            gm_api.err("log_output_element is not an instance of Element.", true); ret = 3;}
        if(!(gm_api.file_select_preview_element instanceof Element) && gm_api.file_select_preview){
            gm_api.err("file_preview_element is not an instance of Element.", true); ret = 4;}
        return ret;
    },

    clear_file_select_buffer : function(){
        file_select_buffer = new Array();
    },

    handle_file_select : function(e){
        if(gm_api.file_select_no_stack_up){gm_api.clear_file_select_buffer();}
        gm_api.file_select_buffer.push.apply(gm_api.file_select_buffer, e.target.files);
        if(gm_api.file_select_preview){ gm_api.update_file_select_preview();}
        if(gm_api.file_select_quick_upload){gm_api.upload_selected_files(gm_api.file_select_quick_upload_directory);}
    },

    update_file_select_preview(){
        if(gm_api.file_select_preview_element instanceof Element){
            gm_api.file_select_preview_element.innerHTML = "";
            for(let i=0, f; f=gm_api.file_select_buffer[i]; i++){
                if(!f.type.match('image.*')){ continue; }
                var reader = new FileReader();
                reader.onload = (function(file){
                    return function(e){
                        var span = document.createElement('span');
                        span.innerHTML = ['<img class="',gm_api.file_select_preview_css_class,
                            '" src="', e.target.result, '"title="', escape(file.name), '"/>,'].join('');
                        gm_api.file_select_preview_element.insertBefore(span, null);
                    }
                })(f);
                reader.readAsDataURL(f);
            }
        }else{
            gm_api.err("file_preview_element is not an instance of Element.");
        }
    },

    get_file_list : function(){ 
        return gm_api._request('get_file_list', gm_api.apiurl, null, true); 
    },

    get_file_tree : function(path = "/"){
        var params = { "path" : path };
        return gm_api._request('get_file_tree', gm_api.apiurl, params, true); 
    },

    get_base : function(){
        return gm_api._request('get_base'     , gm_api.apiurl, null, true); 
    },

    upload_selected_files(path){ // TODO: async
        var omitted = 0;
        var total = gm_api.file_select_buffer.length;
        if(path === undefined){ gm_api.err("path is not specified."); return undefined; } 
        while(gm_api.file_select_buffer.length > omitted){
            var form_data = new FormData();
            form_data.append('file', gm_api.file_select_buffer[omitted]);
            form_data.append('path', path);
            form_data.append('newname', gm_api.file_select_buffer[omitted].newname);

            var ret = gm_api._request('upload_file',gm_api.apiurl,form_data, true); 
            var failed = (ret === undefined || ret.error != 0);
            var repeat = false;
            if(ret === undefined){ gm_api.err( "uploading "+ gm_api.file_select_buffer[omitted].name +" failed"); }
            else if(ret.error != 0){ 
                if(ret.error == 3){
                    var file = gm_api.file_select_buffer[omitted];
                    var name = (file.newname === undefined ? file.name : file.newname);
                    var ext = name.substring(name.lastIndexOf("."));
                    var name = name.slice(0, -(ext.length));
            console.log(name);
                    var regex = new RegExp
                        ( gm_api.file_rename_index_prefix + "[0-9]+" + gm_api.file_rename_index_postfix, "gm")
                    index = name.match(regex);
                    if(index == null){
                        name+=
                            gm_api.file_rename_index_prefix+"0"+gm_api.file_rename_index_postfix;
                    }else{
                        name = name.slice(0, -(
                            gm_api.file_rename_index_prefix.length + 
                            index[0].length +
                            gm_api.file_rename_index_postfix.length
                        ));
                        name+=
                            gm_api.file_rename_index_prefix+(parseInt(index[0])+1)+gm_api.file_rename_index_postfix;
                    }
                    name += ext;
                    repeat = true;
                    failed = false;
                    gm_api.file_select_buffer[omitted].newname = name;
                }else{
                    gm_api.err( "SERVER: "+ ret.err_msg); }
                }
            else{ gm_api.log("SERVER: "+ ret.err_msg); }
            if(gm_api.file_upload_fail_fast && failed){return undefined;}
            if(gm_api.file_upload_persist_failed && failed){ omitted+=1; continue;}
            if(!repeat){ gm_api.file_select_buffer.splice(omitted, 1); }
            if(gm_api.file_select_preview){ gm_api.update_file_select_preview();}
        }
        gm_api.log("uploaded " + (total-omitted) + " of " + total)
        return (total - omitted);
    },

    delete_files : function(arr){ 
        if(!Array.isArray(arr)){ gm_api.err("arr is not an array."); return undefined;}
        var omitted = 0;
        var total = arr.length;
        var iter = 0;
        while(iter < total){
            var params = {"path":arr[iter]};
            var ret = gm_api._request('delete_file',gm_api.apiurl, params, true); 
            var failed = (ret === undefined || ret != 0);
            if(ret === undefined){ gm_api.err( "deleting "+ arr[iter] +" failed"); }
            else if(ret.error != 0){ gm_api.err( "SERVER: "+ ret.err_msg); }
            else{ gm_api.log("SERVER: "+ ret.err_msg); }
            if(gm_api.file_delete_fail_fast && failed){return undefined;}
            iter++;
        }
        return (total - omitted);
    },

    delete_directories : function(arr){ 
        if(!Array.isArray(arr)){ gm_api.err("arr is not an array."); return undefined;}
        var omitted = 0;
        var total = arr.length;
        var iter = 0;
        while(iter < total){
            var params = { "path":arr[iter] };
            var ret = gm_api._request('delete_directory',gm_api.apiurl,params, true); 
            var failed = (ret === undefined || ret != 0);
            if(ret === undefined){ gm_api.err( "deleting "+ arr[iter] +" failed"); }
            else if(ret.error != 0){ gm_api.err( "SERVER: "+ ret.err_msg); }
            else{ gm_api.log("SERVER: "+ ret.err_msg); }
            if(gm_api.file_delete_fail_fast && failed){return undefined;}
            iter++;
        }
        return (total - omitted);
    },

    create_directories : function(arr){
        if(!Array.isArray(arr)){ gm_api.err("arr is not an array."); return undefined;}
        var omitted = 0;
        var total = arr.length;
        var iter = 0;
        while(iter < total){
            var params = {"type":"directory", "path":arr[iter]};
            var ret = gm_api._request('create_directory',gm_api.apiurl,params, true); 
            var failed = (ret === undefined || ret != 0);
            if(ret === undefined){ gm_api.err( "creating "+ arr[iter] +" failed"); }
            else if(ret.error != 0){ gm_api.err( "SERVER: "+ ret.err_msg); }
            else{ gm_api.log("SERVER: "+ ret.err_msg); }
            if(gm_api.create_directories_fail_fast && failed){return undefined;}
            iter++;
        }
        return (total - omitted);
    },

    rename_files : function(arr, name){
        if(!Array.isArray(arr)){ gm_api.err("arr is not an array."); return undefined;}
        var omitted = 0;
        var total = arr.length;
        var iter = 0;
        while(iter < total){
            var params = {"name":name + gm_api.file_rename_index_prefix + 
                iter + gm_api.file_rename_index_postfix, "path":arr[iter] }
            if(arr.length == 1 && gm_api.file_rename_one_no_index){params.name = name;}
            var ret = gm_api._request('reaname_file',gm_api.apiurl,params, true); 
            var failed = (ret === undefined || ret != 0);
            if(ret === undefined){ gm_api.err( "renaming "+ arr[iter] +" failed"); }
            else if(ret.error != 0){ gm_api.err( "SERVER: "+ ret.err_msg); }
            else{ gm_api.log("SERVER: "+ ret.err_msg); }
            if(gm_api.file_rename_fail_fast && failed){return undefined;}
            iter++;
        }
        return (total - omitted);
    },

    _request : function (method, url, params, json_output=false){
        var ret;
        var pass = {'method' : method, 'params' : params };
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, false);
        xhr.onreadystatechange = function() {
            if(xhr.readyState === 4){
                if(xhr.status === 200 || xhr.status == 0){
                    ret = xhr.responseText;
                }
            }
        }
        xhr.send(JSON.stringify(pass));
        if(ret === undefined){ 
            gm_api.err(gm_api._request.caller.name + "failed."); return undefined;}
        else{ return (json_output) ? JSON.parse(ret) : ret; }
    },

    log_output : function(){
        if(gm_api.log_output_element instanceof Element){
            gm_api.log_output_element.innerHTML = "";
            for(    let i=gm_api.log_buffer_iter;
                    i != Math.abs((gm_api.log_buffer_iter-1)%gm_api.log_buffer_size) ;
                    i=(i+1)%gm_api.log_buffer_size){
                if(gm_api.log_buffer[i] != undefined){
                    gm_api.log_output_element.innerHTML += gm_api.log_buffer[i];
                }
            }
        }else{ 
            gm_api.err("log_output_element is not an instance of Element.", true);
            gm_api.log()
        }
    },

    log : function(info, force_console = false){
        caller = this.log.caller.name;
        var msg = "[" + new Date().toLocaleString() + "] " + caller + ": " + info;
        gm_api.log_buffer[gm_api.log_buffer_iter++] = msg + gm_api.log_buffer_endline;
        gm_api.log_buffer_iter %= gm_api.log_buffer_size;
        if(force_console || gm_api.log_console_output){ console.log(msg); }
        if(!force_console && gm_api.log_element_output){ gm_api.log_output();}
    },

    err : function(info, force_console = false){ gm_api.log(info, force_console);}
}
