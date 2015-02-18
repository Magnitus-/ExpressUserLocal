//Copyright (c) 2015 Eric Vallee <eric_vallee2003@yahoo.ca>
//MIT License: https://raw.githubusercontent.com/Magnitus-/ExpressUser/master/License.txt

jQuery.fn.ToJSON = function(IncludeEmpty) {
    var FieldSets = this.children('fieldset');
    var ToReturn = {};
    FieldSets.each(function(Index, Element) {
        var WrappedElement = jQuery(Element);
        var Label = WrappedElement.attr('class');
        var Inputs = WrappedElement.children('input');
        Inputs.each(function(Index, Element) {
            var WrappedElement = jQuery(Element);
            var Value = WrappedElement.val();
            if(Value.length>0||IncludeEmpty)
            {
                if(typeof(ToReturn[Label])=='undefined')
                {
                    ToReturn[Label] = {};
                }
                ToReturn[Label][WrappedElement.attr('name')] = Value;
            }
        });
    });
    var Csrf = this.children('input[name=_csrf]');
    Csrf.each(function(Index, Element) {
        var WrappedElement = jQuery(Element);
        ToReturn[WrappedElement.attr('name')] = WrappedElement.val();
    });
    return ToReturn;
}

jQuery.fn.Send = function() {
    var Section = this.closest('section').attr('class');
    var Data = this.ToJSON();
    var URL = null;
    var Method = null;
    if(Section=='Login')
    {
        Method = 'PUT';
        URL = '/Session/Self/User';
    }
    else if(Section=='Logout')
    {
        Method = 'DELETE';
        URL = '/Session/Self/User';
    }
    else if(Section=='Add')
    {
        Method = 'POST';
        URL = "/Users";
    }
    else if(Section=='Modify')
    {
        Method = 'PATCH';
        if(!Data['Url'])
        {
            URL = '/User/Self';
        }
        else
        {
            URL = '/User';
        }
    }
    else if(Section=='Delete')
    {
        Method = 'DELETE';
        if(!Data['Url'])
        {
            URL = '/User/Self';
        }
        else
        {
            URL = '/User';
        }
    }
    else if(Section=='Get')
    {
        Method = 'GET';
        if(!Data['Url'])
        {
            URL = '/User/Self';
        }
        else
        {
            URL = '/User';
        }
    }
    else if(Section=='GetSession')
    {
        Method = 'GET';
        URL = '/Session/Self/User';
    }
    else if(Section=='Elevate')
    {
        Method = 'POST';
        URL = '/User/Self/Memberships/Admin';
    }
    
    if(Data['Url'])
    {
        if(Data['Url']['Username'])
        {
            URL = URL + '/Username/'+Data['Url']['Username'];
        }
        else
        {
            URL = URL + '/Email/'+Data['Url']['Email'];
        }
    }
    
    var Options = {'cache': false, 'type': Method};
    if(Data && (Method!='GET'))
    {
        Options['data']=JSON.stringify(Data);
        Options['dataType']='json';
        Options['contentType'] = 'application/json; charset=UTF-8';
    }
    
    jQuery.ajax(URL, Options).done(function(Data, TextStatus, XHR) {
        var Content = "";
        Content+='<p>Status: '+XHR.status+'</p>';
        Content+='<p>Data: '+JSON.stringify(Data)+'</p>';
        jQuery('output').html(Content);
    }).fail(function(XHR, TextStatus, Error) {
        var Content = "";
        Content+='<p>Status: '+XHR.status+'</p>';
        jQuery('output').html(Content);
    });
}

jQuery('body').on('click', 'button', function(Event) {
    Event.preventDefault();
    var Section = jQuery(this).closest('section');
    Section.children('form').Send();
});

jQuery('body').on('keyup', '.Add input[name=Username]', function(Event) {
    var Input = jQuery(this);
    var PreviousValue = Input.val();
    jQuery('section.Add p.Error').html('');
    setTimeout(function(){
        if(Input.val()==PreviousValue)
        {
            var Options = {'cache': false, 'type': 'GET', 'dataType': 'json'};
            jQuery.ajax('/Users/Username/'+Input.val()+'/Count', Options).done(function(Data, TextStatus, XHR) {
                if(Data.Count>0)
                {
                    jQuery('section.Add p.Error').html('Warning, username '+Input.val()+' already taken.');
                }
            }).fail(function(XHR, TextStatus, Error) {
                console.log('Request to '+Input.val()+' failed. Return code is '+XHR.status+'.');
            });
        }
    }, 1000)
});

