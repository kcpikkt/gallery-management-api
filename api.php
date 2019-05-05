<?php
    session_start();
    $msg = "";
    $base = "contents/";
    $upload_no_overwrite = true; 
    $rename_no_overwrite = false;
    $DS = DIRECTORY_SEPARATOR;
    $metadata_max_size = 1024;

    $input_raw = file_get_contents("php://input");
    $input = json_decode($input_raw, true);


    if($_SERVER['REQUEST_METHOD'] == 'POST'){
        $params = $input['params'];
        $method = $input['method'];
        
        error_log(json_encode($params));
        error_log(json_encode($_POST));
        //FIXME
        if($params === NULL){
            $params = $_POST;
            if(isset($params['method']))
                $method = $params['method'];
        }

        switch($method){
            case "get_file_tree":
                get_file_tree   ($params);
                break;
            case "get_file_list":
                get_file_list   ($params);
                break;
            case "reaname_file":
                rename_file     ($params);
                break;
            case "upload_file":
                upload_file     ($params);
                break;
            case "delete_file":
                delete_file     ($params);
                break;
            case "create_directory":
                create_directory($params);
                break;
            case "delete_directory":
                delete_directory($params);
                break;
            case "get_base":
                get_base        ($params);
                break;
            case "set_file_metadata":
                edit_file_metadata($params, true);
                break;
            case "edit_file_metadata":
                edit_file_metadata($params, false);
                break;

            default:
                break;
        }
    }

    function validate_path($path){
        global $base;
        global $DS;
        $testpath = $path;
        $safeiter = 0;
        while(realpath($testpath) === false){
            $safeiter++;
            $testpath = dirname($testpath).$DS;
            if($safeiter > 100){ 
                echo_err(100, "$path is invalid");
            }
        }
        $prefix = realpath(getcwd().$DS.$base.$DS);
        return ( substr(realpath($testpath) , 0, strlen($prefix)) === $prefix );
    }

    class RecursiveFilesIterator extends RecursiveFilterIterator{
        public static $FILTERS = array('/.');
        public function accept(){
            $cur = $this->current();
            foreach(self::$FILTERS as $filter){
                if(strpos($cur, $filter) !== false){ return false; } }
            return true;
        }
    }
    function _return($ret, $code = 0){
        global $msg;
        $ret['code'] = $code;
        $ret['msg']  = $msg;
        echo json_encode($ret);
    }
    function get_file_tree($params){
        function add_entry_at(&$arr, $at, $index,$path,$depth = 0){
            global $base;
            global $filetypes;
            if($depth >= sizeof($at)){return;}
            foreach($arr as &$entry){
                if($entry['name'] == $at[$index]){
                    add_entry_at($entry['children'],$at, $index+1,$path, $depth+1);
                    return;
                }
            }
            $timestamp = filemtime($path);
            $name = $at[$index];
            if(substr($path, 0, strlen($base)) == $base){
                $newpath = substr($path, strlen($base));
            }
            $newentry = array(
                'name' => $name, 
                'path' => $newpath,
                'depth' => $index + 1,
                'children' => array(), 
                'is_directory' => is_dir($path)
            );
            add_entry_at($newentry['children'], $at, $index+1,$path, $depth+1);
            array_push($arr, $newentry);
            return;
        }
        function sort_entries_rec_cmp($a, $b){
            return $b['timestamp'] - $a['timestamp'];}
        function sort_entries_rec(&$arr){
            usort($arr, "sort_entries_rec_cmp");
            foreach($arr as $element){ sort_entries_rec($element['children']); }
        }
        global $base;
        global $DS;
        $path = $params['path'];
        $path = empty($path) ? "/" : $path;
        error_log($path);

        // input sanitization, important 
        if(!validate_path($base.$DS.$path))
            echo_err(10, "$path is invalid"); 
        if(!file_exists($base.$DS.$path))
            echo_err(1, "$path does not exist.");
        else if(!is_dir($base.$DS.$path))
            echo_err(2, "$path is not a directory");

        $dir = new RecursiveDirectoryIterator($base.$DS.$path);
        $files = new RecursiveIteratorIterator(
            new RecursiveFilesIterator($dir),
            RecursiveIteratorIterator::SELF_FIRST);

        $rootnode = array(
            'name' => ($path == "/" ? "root" : basename($path)), 
            'path' => $path,
            'depth' => 0,
            'children' => array(), 
            'is_directory' => true
        );
        
        foreach($files as $filepath => $file){
            error_log(substr($filepath, strlen($base)) );
            $delimited_path = 
                array_values ( array_filter( 
                        explode($DS, substr($filepath, strlen($base))) ,'strlen')) ;
            $depth = max($depth, sizeof($delimited_path));

            add_entry_at($rootnode['children'], $delimited_path, 0,$filepath, 0);
        }
        $ret = array(
            'tree' => $rootnode,
            'depth' => $depth
        );
        
        _return($ret);
    }

    function get_file_list($params){
        global $base;
        $dir = new RecursiveDirectoryIterator($base);
        $files = new RecursiveIteratorIterator(
            new RecursiveFilesIterator($dir),
            RecursiveIteratorIterator::SELF_FIRST);
        $filelist = array();
        foreach($files as $filename => $file){array_push($filelist, $filename);}
        echo json_encode($filelist);
    }

    function get_base($params){
        global $base;
        echo json_encode( array( 'base' => $base ) );
        exit(0);
    }
    function edit_file_metadata($params, $overwrite = false){
        global $base;
        global $DS;
        global $metadata_max_size;
        $path = $params["path"];
        $meta = $params["meta"];
        // input sanitization, important 
        if(!validate_path($base.$DS.$path)){ echo_err(10, "$path is invalid"); }
        if(strcmp(realpath($base.$DS.$path), realpath(getcwd().$DS.$base)) === 0) { 
            echo_err(10, "$path is invalid"); } 

        if(!file_exists($base.$DS.$path)){
            echo_err(1, "$path does not exist.");
        }else if(gettype($meta) != "array"){
            echo_err(2, "metadata is invalid");
        }else{
            $metafilename = ".".basename($path).".meta";
            $metafilepath = realpath($base).$DS.dirname($path).$DS.$metafilename;

            if(!file_exists($metafilepath))
                $metafile = fopen($metafilepath, "x+");
            else
                $metafile = fopen($metafilepath, "r+");

            $metadata_json = fread($metafile, $metadata_max_size);
            $metadata = json_decode($metadata_json, true);
            fclose($metafile);

            error_log(true);
            if(gettype($metadata) != "array" ) $metadata = array();

            foreach($meta as $key => $value) $metadata[$key] = $value;

            error_log(json_encode($metadata));
            $metadata_json = json_encode($metadata);
            file_put_contents($metafilepath, $metadata_json);
        }
        echo_err(0, $metadata_json);
    }
    function upload_file($params){
        global $base;
        global $DS;
        $path = $_POST["path"];
        if(!$path){
            echo_err(5,"no path parameter."); exit;
        }
        $filename = $_FILES['file']['name'];
        $newname = $params['newname'];
        file_put_contents('php://stderr', "$newname\n");
        if(strcmp($newname,"undefined")){
            $filename = $newname;
        }

        if ( 0 < $_FILES['file']['error']){
            echo_err(1,"$filename uploading error.");
        }else if(!file_exists($base.$DS.$path)){
            echo_err(2 ,"$path does not exist.");
        }else if($upload_no_overwrite && file_exists($base.$DS.$path.$DS.$filename)){
            echo_err(3, "file ".$path.$DS.$filename." exists, overwrite disabled.");
        }else{
            $ret = move_uploaded_file( $_FILES['file']['tmp_name'],$base.$path.$DS.$filename);
            if($ret){ echo_err(0,"$filename successfully uploaded.");}
            else { echo_err(4, "$filename saving error.");}
        }
    }
    function delete_file($params){
        global $base;
        global $DS;
        $path = $params["path"];

        // input sanitization, important 
        if(!validate_path($base.$DS.$path)){ echo_err(10, "$path is invalid"); }
        if(strcmp(realpath($base.$DS.$path), realpath(getcwd().$DS.$base)) === 0) { 
            echo_err(10, "$path is invalid"); } 

        if(!file_exists($base.$DS.$path)){
            echo_err(1, "$path does not exist.");
        }else if(is_dir($base.$DS.$path)){
            echo_err(4, "$path is a directory.");
        }else{
            $ret = unlink($base.$DS.$path);
            if($ret){ echo_err(0, "$path deleted.");}
            else{ echo_err(3, "deleting $path failed");}
        }
    }

    function delete_directory($params){
        function delete_rec($target) {
            if(is_dir($target)){
                $files = glob( $target . '*', GLOB_MARK ); 
                foreach( $files as $file ){
                    delete_rec( $file );}
                $ret = rmdir( $target );
                if(!$ret){ echo_err(3, "deleting $target failed"); exit;}
                return $ret;
            } elseif(is_file($target)) {
                $ret = unlink($target);
                if(!$ret){ echo_err(3, "deleting $target failed"); exit;}
            }
        }
        global $base;
        global $DS;

        $path = $params["path"];
        // input sanitization, important 
        if(!validate_path($base.$DS.$path)){ echo_err(10, "$path is invalid"); }
        if(strcmp(realpath($base.$DS.$path), realpath(getcwd().$DS.$base)) === 0) { 
            echo_err(10, "$path is invalid"); } 

        $path = $path.$DS;
        if(!file_exists($base.$DS.$path)){
            echo_err(1, "$path does not exist.");
        }else if(!is_dir($base.$DS.$path)){
            echo_err(2, "$path is not a directory");
        }else{
            $ret = delete_rec($base.$path);
            if($ret){ echo_err(0, "$path deleted.");}
        }
    }
    function create_directory($params){
        global $base;
        global $DS;
        $path = $params["path"];

        // input sanitization, important 
        if(!validate_path($base.$DS.$path)){ echo_err(10, "$path is invalid"); }
        if(strcmp(realpath($base.$DS.$path), realpath(getcwd().$DS.$base)) === 0) { 
            echo_err(10, "$path is invalid"); } 

        if(file_exists($base.$path)){
            echo_err(1, "$path already exists.");
        }else{
            $ret = mkdir($base.$path, 0777, true);
            if($ret){ echo_err(0, "$path created.");}
            else{ echo_err(3, "creating $path failed");}
        }
    }
    function rename_file($params){ //or directory
        global $base;
        global $DS;
        $name = $params["name"];
        $original = $params["path"];
        
        // input sanitization, important 
        if(!validate_path($base.$DS.$original)){ echo_err(10, "$original is invalid"); }
        if(strcmp(realpath($base.$DS.$original), realpath(getcwd().$DS.$base)) === 0) { 
            echo_err(10, realpath($base.$DS.$original)); } 

        $newname = $name;
        $pathinfo = pathinfo($original);
        if(isset($pathinfo['extension'])){
            $newname .= "." . $pathinfo['extension'];}

        if(!file_exists($base.$DS.$original)){
            echo_err(1, "$original does not exist.");
        }else{
            $oldfilepath = realpath($base.$DS.$original);
            $newfilepath = dirname($oldfilepath).$DS.$newname;
            if(rename( $oldfilepath ,$newfilepath ) ) { 
                echo_err(0, "$original renamed to $newname.");}
            else{ echo_err(3, "renaming $original to $name failed");}
        }
    }

    function echo_err($code, $msg){ 
        echo json_encode(array( "error" => $code, "err_msg" => $msg)); exit($code); }
?> 
